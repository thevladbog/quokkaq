package middleware

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/config"
)

// SetupWizardTokenGate enforces SETUP_TOKEN for SaaS first-run routes when APP_ENV is production or staging.
func SetupWizardTokenGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.SetupTokenStrictAndMissing() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "SETUP_TOKEN must be set when APP_ENV is production or staging",
			})
			return
		}
		if config.SetupTokenStrictEnv() && config.SetupTokenConfigured() {
			if !config.SetupTokenMatches(r.Header.Get("X-Setup-Token")) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "invalid or missing X-Setup-Token",
				})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
