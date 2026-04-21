package middleware

import (
	"context"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
)

// WebSocketHandler validates JWT (query access_token, cookie, or Authorization) before WS upgrade,
// checks human users are active, and enforces unit room subscribe authorization.
func WebSocketHandler(hub *ws.Hub, userRepo repository.UserRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := accessTokenFromWebSocketRequest(r)
		if tok == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		ctx, err := ContextFromJWTAccessToken(r.Context(), tok)
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		if typ, _ := ctx.Value(TokenTypeKey).(string); typ != "terminal" {
			userID, ok := GetUserIDFromContext(ctx)
			if !ok || userID == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			u, err := userRepo.FindByID(r.Context(), userID)
			if err != nil || !u.IsActive {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
		}

		canSubscribe := func(c context.Context, unitID string) bool {
			unitID = strings.TrimSpace(unitID)
			if unitID == "" {
				return false
			}
			typ, _ := c.Value(TokenTypeKey).(string)
			if typ == "terminal" {
				got, ok := c.Value(TerminalUnitIDKey).(string)
				if !ok {
					return false
				}
				return strings.EqualFold(strings.TrimSpace(got), unitID)
			}
			userID, ok := GetUserIDFromContext(c)
			if !ok || userID == "" {
				return false
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, unitID)
			return err == nil && allowed
		}

		ws.ServeWsAuthenticated(hub, canSubscribe, w, r.WithContext(ctx))
	}
}
