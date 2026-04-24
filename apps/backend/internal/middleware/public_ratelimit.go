package middleware

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"
)

const publicLimiterEntryTTL = 10 * time.Minute

// Public API rate: one token every publicAPIRateInterval (sustained), burst publicAPIBurst.
// A single screen page hits several public GETs in parallel (queue, playlist, announcements, materials);
// the Next.js /api/* proxy to Go can share one upstream client IP, so the burst must cover those bursts
// and occasional WebSocket-driven refetches.
const (
	publicAPIRateInterval = 1 * time.Second
	publicAPIBurst        = 32
	maxPublicAPILimiters  = 50_000
)

type publicLimiterEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

var publicAPILimiterMu sync.Mutex
var publicAPILimiters = make(map[string]*publicLimiterEntry)

func init() {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			now := time.Now()
			publicAPILimiterMu.Lock()
			for k, e := range publicAPILimiters {
				if now.Sub(e.lastSeen) > publicLimiterEntryTTL {
					delete(publicAPILimiters, k)
				}
			}
			publicAPILimiterMu.Unlock()
			empIdpResolveMu.Lock()
			for k, e := range empIdpResolveLimiters {
				if now.Sub(e.lastSeen) > publicLimiterEntryTTL {
					delete(empIdpResolveLimiters, k)
				}
			}
			empIdpResolveMu.Unlock()
		}
	}()
}

// PublicAPIRateLimit limits unauthenticated or low-trust public endpoints per client IP.
func PublicAPIRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		publicAPILimiterMu.Lock()
		ent, ok := publicAPILimiters[ip]
		if !ok {
			if len(publicAPILimiters) >= maxPublicAPILimiters {
				publicAPILimiterMu.Unlock()
				http.Error(w, "Too many requests", http.StatusTooManyRequests)
				return
			}
			ent = &publicLimiterEntry{
				lim:      rate.NewLimiter(rate.Every(publicAPIRateInterval), publicAPIBurst),
				lastSeen: time.Now(),
			}
			publicAPILimiters[ip] = ent
		} else {
			ent.lastSeen = time.Now()
		}
		lim := ent.lim
		publicAPILimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

const (
	// Tighter than PublicAPI: abuse of POST virtual-queue (SMS cost / queue spam).
	virtualQueueRateInterval = 3 * time.Second
	virtualQueueBurst        = 5
)

var vqJoinLimiterMu sync.Mutex
var vqJoinLimiters = make(map[string]*publicLimiterEntry)

// VirtualQueueJoinRateLimit is a stricter per-IP limiter for POST /units/{id}/virtual-queue.
func VirtualQueueJoinRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		vqJoinLimiterMu.Lock()
		ent, ok := vqJoinLimiters[ip]
		if !ok {
			if len(vqJoinLimiters) >= maxPublicAPILimiters {
				vqJoinLimiterMu.Unlock()
				http.Error(w, "Too many requests", http.StatusTooManyRequests)
				return
			}
			ent = &publicLimiterEntry{
				lim:      rate.NewLimiter(rate.Every(virtualQueueRateInterval), virtualQueueBurst),
				lastSeen: time.Now(),
			}
			vqJoinLimiters[ip] = ent
		} else {
			ent.lastSeen = time.Now()
		}
		lim := ent.lim
		vqJoinLimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many join attempts from this address", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

const (
	employeeIdpResolveRateIntervalDef = 2 * time.Second
	employeeIdpResolveBurstDef        = 6
)

var (
	empIdpResolveMu       sync.Mutex
	empIdpResolveLimiters = make(map[string]*publicLimiterEntry)
)

// employeeIdpResolveEvery returns the sustained interval from EMPLOYEE_IDP_RESOLVE_RATE_INTERVAL_SEC (default 2).
func employeeIdpResolveEvery() time.Duration {
	s := strings.TrimSpace(os.Getenv("EMPLOYEE_IDP_RESOLVE_RATE_INTERVAL_SEC"))
	if s == "" {
		return employeeIdpResolveRateIntervalDef
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return employeeIdpResolveRateIntervalDef
	}
	return time.Duration(n) * time.Second
}

// employeeIdpResolveBurst returns burst from EMPLOYEE_IDP_RESOLVE_BURST (default 6).
func employeeIdpResolveBurst() int {
	s := strings.TrimSpace(os.Getenv("EMPLOYEE_IDP_RESOLVE_BURST"))
	if s == "" {
		return employeeIdpResolveBurstDef
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return employeeIdpResolveBurstDef
	}
	return n
}

// EmployeeIdpResolveRateLimit limits POST /units/{unitId}/employee-idp/resolve per client IP and unit (kiosk/terminal).
func EmployeeIdpResolveRateLimit(next http.Handler) http.Handler {
	interval := employeeIdpResolveEvery()
	burst := employeeIdpResolveBurst()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		unitID := chi.URLParam(r, "unitId")
		ip := clientIPForRateLimit(r)
		key := ip + "|" + unitID
		empIdpResolveMu.Lock()
		ent, ok := empIdpResolveLimiters[key]
		if !ok {
			if len(empIdpResolveLimiters) >= maxPublicAPILimiters {
				empIdpResolveMu.Unlock()
				http.Error(w, "Too many requests", http.StatusTooManyRequests)
				return
			}
			ent = &publicLimiterEntry{
				lim:      rate.NewLimiter(rate.Every(interval), burst),
				lastSeen: time.Now(),
			}
			empIdpResolveLimiters[key] = ent
		} else {
			ent.lastSeen = time.Now()
		}
		lim := ent.lim
		empIdpResolveMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many employee idp resolve attempts; try again shortly", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
