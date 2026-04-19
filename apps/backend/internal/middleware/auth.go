package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"quokkaq-go-backend/internal/pkg/authcookie"

	"github.com/golang-jwt/jwt/v5"
)

// jwtStringClaim returns a non-empty string claim, normalized to lowercase for UUID comparisons.
func jwtStringClaim(claims jwt.MapClaims, key string) (string, bool) {
	raw, ok := claims[key]
	if !ok || raw == nil {
		return "", false
	}
	s, ok := raw.(string)
	if !ok {
		return "", false
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return "", false
	}
	return strings.ToLower(s), true
}

type contextKey string

const UserIDKey contextKey = "userID"

// TokenTypeKey is JWT audience kind: "user" (staff) or "terminal" (desktop kiosk).
const TokenTypeKey contextKey = "tokenType"

// TerminalUnitIDKey is set when typ=terminal — unit this desktop terminal is bound to.
const TerminalUnitIDKey contextKey = "terminalUnitID"

// TerminalCounterIDKey is set when typ=terminal and the device is bound to a counter (guest survey screen).
const TerminalCounterIDKey contextKey = "terminalCounterID"

// JWTAuth is a middleware that validates JWT tokens and extracts user ID
func JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prefer Authorization: Bearer when present so explicit credentials win over HttpOnly cookies.
		// Otherwise a browser with both a staff session (quokkaq_access) and a terminal Bearer token
		// would use the user JWT and terminal routes return 403 Forbidden.
		tokenString := ""
		if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); authHeader != "" {
			const pfx = "Bearer "
			if len(authHeader) > len(pfx) && strings.EqualFold(authHeader[:len(pfx)], pfx) {
				tokenString = strings.TrimSpace(authHeader[len(pfx):])
			}
		}
		if tokenString == "" {
			tokenString = authcookie.AccessTokenFromRequest(r)
		}
		if tokenString == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			secret = "default_secret_please_change"
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Extract user ID from claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			return
		}

		// Refresh JWTs must only be used with POST /auth/refresh, not as API access tokens.
		if typ, ok := claims["typ"].(string); ok && typ == "refresh" {
			http.Error(w, "Invalid token type", http.StatusUnauthorized)
			return
		}

		userID, ok := claims["sub"].(string)
		if !ok {
			http.Error(w, "Invalid user ID in token", http.StatusUnauthorized)
			return
		}
		userID = strings.TrimSpace(userID)

		ctx := r.Context()
		tokenType := "user"
		if typ, ok := claims["typ"].(string); ok && typ == "terminal" {
			tokenType = "terminal"
			// Canonical form for UUID PK lookups (JWT / URL casing may differ).
			userID = strings.ToLower(userID)
			if uid, ok := jwtStringClaim(claims, "unit_id"); ok {
				ctx = context.WithValue(ctx, TerminalUnitIDKey, uid)
			}
			if cid, ok := jwtStringClaim(claims, "counter_id"); ok {
				ctx = context.WithValue(ctx, TerminalCounterIDKey, cid)
			}
		}
		ctx = context.WithValue(ctx, TokenTypeKey, tokenType)
		ctx = context.WithValue(ctx, UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext extracts user ID from request context
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
