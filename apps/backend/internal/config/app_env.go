package config

import (
	"os"
	"strings"
)

// AppEnvAllowsYooKassaDevReturnURLFallback is true when missing YOOKASSA_PAYMENT_RETURN_URL
// and PUBLIC_APP_URL may use a localhost placeholder in the invoice payment handler.
// Never true for production or staging; never true when APP_ENV is unset/empty (fail closed).
// Only explicit local-dev tokens enable the fallback.
func AppEnvAllowsYooKassaDevReturnURLFallback() bool {
	app := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if app == "production" || app == "staging" {
		return false
	}
	if app == "" {
		return false
	}
	return app == "development" || app == "dev" || app == "local"
}

// ExposePublicLeadUpstreamError is true when POST /public/leads/request may include the
// upstream Tracker error in the JSON body (never when APP_ENV is production or staging).
func ExposePublicLeadUpstreamError() bool {
	app := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if app == "production" || app == "staging" {
		return false
	}
	if v := strings.TrimSpace(os.Getenv("PUBLIC_LEAD_DEBUG")); v == "1" || strings.EqualFold(v, "true") {
		return true
	}
	return app == "development" || app == "dev" || app == "local"
}
