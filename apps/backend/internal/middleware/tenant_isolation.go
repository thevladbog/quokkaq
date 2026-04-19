package middleware

import (
	"context"
	"net/http"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

const companyIDKey contextKey = "companyID"

// GetCompanyIDFromContext retrieves the company ID from the request context
func GetCompanyIDFromContext(ctx context.Context) string {
	if companyID, ok := ctx.Value(companyIDKey).(string); ok {
		return companyID
	}
	return ""
}

// SetCompanyIDInContext stores the company ID in the request context
func SetCompanyIDInContext(ctx context.Context, companyID string) context.Context {
	return context.WithValue(ctx, companyIDKey, companyID)
}

// EnsureTenantAccess middleware ensures the authenticated user has access to the requested company
func EnsureTenantAccess(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok || userID == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Try to get company ID from URL parameter
			companyID := chi.URLParam(r, "companyId")

			// If not in URL, try to get from query parameter
			if companyID == "" {
				companyID = r.URL.Query().Get("companyId")
			}

			// If still not found, this might be a route that doesn't need company isolation
			if companyID == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Check if user has access to this company
			hasAccess, err := userRepo.HasCompanyAccess(userID, companyID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			if !hasAccess {
				http.Error(w, "Forbidden: You don't have access to this organization", http.StatusForbidden)
				return
			}

			// Store company ID in context for downstream handlers
			ctx := SetCompanyIDInContext(r.Context(), companyID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireCompanyOwner middleware ensures the authenticated user is the owner of the company
func RequireCompanyOwner(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok || userID == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			companyID := chi.URLParam(r, "companyId")
			if companyID == "" {
				companyID = r.URL.Query().Get("companyId")
			}

			if companyID == "" {
				http.Error(w, "Company ID required", http.StatusBadRequest)
				return
			}

			isOwner, err := userRepo.IsCompanyOwner(userID, companyID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			if !isOwner {
				http.Error(w, "Forbidden: Only company owner can perform this action", http.StatusForbidden)
				return
			}

			ctx := SetCompanyIDInContext(r.Context(), companyID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
