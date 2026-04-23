package middleware

import (
	"net/http"
	"sync"
	"time"

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
