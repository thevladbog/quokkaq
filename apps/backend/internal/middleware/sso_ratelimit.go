package middleware

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

var ssoPublicLimiterMu sync.Mutex
var ssoPublicLimiters = make(map[string]*rate.Limiter)

var ssoCallbackLimiterMu sync.Mutex
var ssoCallbackLimiters = make(map[string]*rate.Limiter)

// SSOPublicRateLimit limits public SSO and tenant-hint endpoints per client IP (~20/min burst).
func SSOPublicRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		ssoPublicLimiterMu.Lock()
		lim, ok := ssoPublicLimiters[ip]
		if !ok {
			lim = rate.NewLimiter(rate.Every(3*time.Second), 10)
			ssoPublicLimiters[ip] = lim
		}
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
		lim, ok := ssoCallbackLimiters[ip]
		if !ok {
			lim = rate.NewLimiter(rate.Every(500*time.Millisecond), 40)
			ssoCallbackLimiters[ip] = lim
		}
		ssoCallbackLimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
