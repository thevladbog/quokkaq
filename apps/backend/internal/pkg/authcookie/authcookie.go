// Package authcookie sets HttpOnly session cookies for browser clients (same-origin /api proxy).
//
// CSRF: session cookies use SameSite=Lax, so top-level navigations and same-site requests include
// the cookie while typical cross-site POSTs (e.g. evil.com → our API) do not. For defense in depth
// on state-changing endpoints, prefer JSON APIs with Content-Type: application/json (browsers send
// preflight for cross-origin non-simple requests) and keep mutations behind authenticated routes.
package authcookie

import (
	"net/http"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/services"
)

const (
	AccessCookieName  = "quokkaq_access"
	RefreshCookieName = "quokkaq_refresh"
	cookiePath        = "/"
)

// AccessMaxAge matches access JWT lifetime (see auth_service generateAccessToken).
const AccessMaxAge = 24 * time.Hour

// RefreshMaxAge matches refresh JWT lifetime (see auth_service generateRefreshToken).
const RefreshMaxAge = 30 * 24 * time.Hour

func secureFlag(r *http.Request) bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("AUTH_COOKIE_INSECURE")), "true") {
		return false
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// WriteSessionCookies sets HttpOnly cookies for access and refresh tokens.
func WriteSessionCookies(w http.ResponseWriter, r *http.Request, pair *services.TokenPair) {
	if pair == nil {
		return
	}
	sec := secureFlag(r)
	http.SetCookie(w, &http.Cookie{
		Name:     AccessCookieName,
		Value:    pair.AccessToken,
		Path:     cookiePath,
		MaxAge:   int(AccessMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   sec,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    pair.RefreshToken,
		Path:     cookiePath,
		MaxAge:   int(RefreshMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   sec,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookies clears auth cookies (e.g. logout).
func ClearSessionCookies(w http.ResponseWriter, r *http.Request) {
	sec := secureFlag(r)
	clear := func(name string) {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     cookiePath,
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   sec,
			SameSite: http.SameSiteLaxMode,
		})
	}
	clear(AccessCookieName)
	clear(RefreshCookieName)
}

// AccessTokenFromRequest returns the bearer token from cookie (preferred) or empty.
func AccessTokenFromRequest(r *http.Request) string {
	c, err := r.Cookie(AccessCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}

// RefreshTokenFromRequest returns refresh JWT from cookie or empty.
func RefreshTokenFromRequest(r *http.Request) string {
	c, err := r.Cookie(RefreshCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}
