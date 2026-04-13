package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserIDKey contextKey = "userID"

// TokenTypeKey is JWT audience kind: "user" (staff) or "terminal" (desktop kiosk).
const TokenTypeKey contextKey = "tokenType"

// TerminalUnitIDKey is set when typ=terminal — unit this desktop terminal is bound to.
const TerminalUnitIDKey contextKey = "terminalUnitID"

// JWTAuth is a middleware that validates JWT tokens and extracts user ID
func JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]
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

		userID, ok := claims["sub"].(string)
		if !ok {
			http.Error(w, "Invalid user ID in token", http.StatusUnauthorized)
			return
		}

		ctx := r.Context()
		tokenType := "user"
		if typ, ok := claims["typ"].(string); ok && typ == "terminal" {
			tokenType = "terminal"
			if uid, ok := claims["unit_id"].(string); ok && strings.TrimSpace(uid) != "" {
				ctx = context.WithValue(ctx, TerminalUnitIDKey, strings.TrimSpace(uid))
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
