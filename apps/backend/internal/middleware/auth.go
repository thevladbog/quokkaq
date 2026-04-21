package middleware

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/pkg/authcookie"
	"quokkaq-go-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
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

// ContextFromJWTAccessToken parses an access JWT and returns context with UserIDKey / TokenTypeKey / terminal keys.
func ContextFromJWTAccessToken(base context.Context, tokenString string) (context.Context, error) {
	tokenString = strings.TrimSpace(tokenString)
	if tokenString == "" {
		return base, jwt.ErrTokenMalformed
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return base, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return base, jwt.ErrTokenInvalidClaims
	}
	userID, ok := claims["sub"].(string)
	if !ok {
		return base, jwt.ErrTokenInvalidClaims
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return base, jwt.ErrTokenInvalidClaims
	}

	var typ string
	if raw, ok := claims["typ"]; ok && raw != nil {
		s, ok := raw.(string)
		if !ok {
			return base, jwt.ErrTokenInvalidClaims
		}
		typ = strings.TrimSpace(s)
	}
	// Allowlist: staff JWTs use typ "access" or omit typ; desktop terminals use "terminal".
	switch typ {
	case "refresh":
		return base, jwt.ErrTokenInvalidClaims
	case "", "access":
		// staff session
	case "terminal":
		// handled below
	default:
		return base, jwt.ErrTokenInvalidClaims
	}

	ctx := base
	tokenType := "user"
	if typ == "terminal" {
		tokenType = "terminal"
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
	return ctx, nil
}

// JWTAuth is a middleware that validates JWT tokens and extracts user ID
func JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		ctx, err := ContextFromJWTAccessToken(r.Context(), tokenString)
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireHumanUserActive returns 403 for deactivated staff users (typ=user JWT only). Terminal JWTs skip this check.
func RequireHumanUserActive(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				next.ServeHTTP(w, r)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok || userID == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			u, err := userRepo.FindByID(r.Context(), userID)
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
					return
				}
				logger.ErrorfCtx(r.Context(), "RequireHumanUserActive: FindByID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !u.IsActive {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// JWTAuthAndActive chains JWTAuth and RequireHumanUserActive for staff sessions.
func JWTAuthAndActive(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return JWTAuth(RequireHumanUserActive(userRepo)(next))
	}
}

// accessTokenFromWebSocketRequest reads JWT from query (?access_token=), cookie, or Authorization header.
func accessTokenFromWebSocketRequest(r *http.Request) string {
	if q := strings.TrimSpace(r.URL.Query().Get("access_token")); q != "" {
		return q
	}
	if c := authcookie.AccessTokenFromRequest(r); c != "" {
		return c
	}
	if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); authHeader != "" {
		const pfx = "Bearer "
		if len(authHeader) > len(pfx) && strings.EqualFold(authHeader[:len(pfx)], pfx) {
			return strings.TrimSpace(authHeader[len(pfx):])
		}
	}
	return ""
}

// GetUserIDFromContext extracts user ID from request context
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
