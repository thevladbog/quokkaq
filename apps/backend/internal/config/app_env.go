package config

import (
	"os"
	"strings"
)

// AppEnvAllowsYooKassaDevReturnURLFallback is true when missing YOOKASSA_PAYMENT_RETURN_URL
// and PUBLIC_APP_URL may use a localhost placeholder in the invoice payment handler.
// Never true for production or staging; matches typical local-dev APP_ENV values used elsewhere.
func AppEnvAllowsYooKassaDevReturnURLFallback() bool {
	app := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if app == "production" || app == "staging" {
		return false
	}
	return app == "" || app == "development" || app == "dev" || app == "local"
}
