// Package authcookie sets HttpOnly session cookies for browser clients (same-origin /api proxy).
//
// CSRF: session cookies use SameSite=Lax, so top-level navigations and same-site requests include
// the cookie while typical cross-site POSTs (e.g. evil.com → our API) do not. For defense in depth
// on state-changing endpoints, prefer JSON APIs with Content-Type: application/json (browsers send
// preflight for cross-origin non-simple requests) and keep mutations behind authenticated routes.
//
// Cookies use Secure=true so they are only sent over HTTPS (or over http://localhost and
// http://127.0.0.1, which browsers treat as secure contexts for cookies). Plain-HTTP deployments
// on non-local hosts are not supported for session cookies.
package authcookie

import (
	"net/http"
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

// WriteSessionCookies sets HttpOnly cookies for access and refresh tokens.
func WriteSessionCookies(w http.ResponseWriter, _ *http.Request, pair *services.TokenPair) {
	if pair == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AccessCookieName,
		Value:    pair.AccessToken,
		Path:     cookiePath,
		MaxAge:   int(AccessMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    pair.RefreshToken,
		Path:     cookiePath,
		MaxAge:   int(RefreshMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookies clears auth cookies (e.g. logout).
func ClearSessionCookies(w http.ResponseWriter, _ *http.Request) {
	clear := func(name string) {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     cookiePath,
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   true,
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
