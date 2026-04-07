package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

var terminalBootstrapLimiterMu sync.Mutex
var terminalBootstrapLimiters = make(map[string]*rate.Limiter)

// TerminalBootstrapRateLimit limits POST /auth/terminal/bootstrap per client IP (~30/min with burst).
func TerminalBootstrapRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIPForRateLimit(r)
		terminalBootstrapLimiterMu.Lock()
		lim, ok := terminalBootstrapLimiters[ip]
		if !ok {
			lim = rate.NewLimiter(rate.Every(2*time.Second), 15)
			terminalBootstrapLimiters[ip] = lim
		}
		terminalBootstrapLimiterMu.Unlock()
		if !lim.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIPForRateLimit(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
