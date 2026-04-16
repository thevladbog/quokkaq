package middleware

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const ssoLimiterEntryTTL = 10 * time.Minute

type ssoLimiterEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

var ssoPublicLimiterMu sync.Mutex
var ssoPublicLimiters = make(map[string]*ssoLimiterEntry)

var ssoCallbackLimiterMu sync.Mutex
var ssoCallbackLimiters = make(map[string]*ssoLimiterEntry)

func init() {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			now := time.Now()
			ssoPublicLimiterMu.Lock()
			for k, e := range ssoPublicLimiters {
				if now.Sub(e.lastSeen) > ssoLimiterEntryTTL {
					delete(ssoPublicLimiters, k)
				}
			}
			ssoPublicLimiterMu.Unlock()

			ssoCallbackLimiterMu.Lock()
			for k, e := range ssoCallbackLimiters {
				if now.Sub(e.lastSeen) > ssoLimiterEntryTTL {
					delete(ssoCallbackLimiters, k)
				}
			}
			ssoCallbackLimiterMu.Unlock()
		}
	}()
}

// SSOPublicRateLimit limits public SSO and tenant-hint endpoints per client IP (~20/min burst).
func SSOPublicRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		ssoPublicLimiterMu.Lock()
		ent, ok := ssoPublicLimiters[ip]
		if !ok {
			ent = &ssoLimiterEntry{
				lim:      rate.NewLimiter(rate.Every(3*time.Second), 10),
				lastSeen: time.Now(),
			}
			ssoPublicLimiters[ip] = ent
		} else {
			ent.lastSeen = time.Now()
		}
		lim := ent.lim
		ssoPublicLimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// SSOCallbackRateLimit applies a separate, looser per-IP limit to GET /auth/sso/callback only.
// The OIDC provider may issue several redirects or retries during a successful login; the stricter
// SSOPublicRateLimit bucket is reserved for JSON/API-style calls. This still mitigates brute force
// and accidental callback storms without blocking normal IdP behavior.
func SSOCallbackRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		ssoCallbackLimiterMu.Lock()
		ent, ok := ssoCallbackLimiters[ip]
		if !ok {
			ent = &ssoLimiterEntry{
				lim:      rate.NewLimiter(rate.Every(500*time.Millisecond), 40),
				lastSeen: time.Now(),
			}
			ssoCallbackLimiters[ip] = ent
		} else {
			ent.lastSeen = time.Now()
		}
		lim := ent.lim
		ssoCallbackLimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
