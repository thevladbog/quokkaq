package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Context keys for integration API key auth (Bearer qqk_<keyId>_<secret>).
type integrationCtxKey string

const (
	IntegrationKeyCompanyIDKey integrationCtxKey = "integrationKeyCompanyID"
	IntegrationKeyIDKey        integrationCtxKey = "integrationKeyID"
	IntegrationKeyScopesKey    integrationCtxKey = "integrationKeyScopes"
	IntegrationKeyUnitIDKey    integrationCtxKey = "integrationKeyUnitID"
)

// GetIntegrationKeyCompanyID returns the company id set by IntegrationAPIKeyAuth.
func GetIntegrationKeyCompanyID(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(IntegrationKeyCompanyIDKey).(string)
	return v, ok && strings.TrimSpace(v) != ""
}

// GetIntegrationKeyID returns the integration API key id from context (set by IntegrationAPIKeyAuth).
func GetIntegrationKeyID(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(IntegrationKeyIDKey).(string)
	return v, ok && strings.TrimSpace(v) != ""
}

// GetIntegrationKeyScopes returns scope strings from the active integration key.
func GetIntegrationKeyScopes(ctx context.Context) []string {
	v, _ := ctx.Value(IntegrationKeyScopesKey).([]string)
	return v
}

// IntegrationKeyHasScope returns true when the request context includes the given scope.
func IntegrationKeyHasScope(ctx context.Context, want string) bool {
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	for _, s := range GetIntegrationKeyScopes(ctx) {
		if strings.EqualFold(strings.TrimSpace(s), want) {
			return true
		}
	}
	return false
}

// IntegrationAPIKeyAuth validates Bearer tokens that start with qqk_ (integration keys).
// Staff JWTs (typically eyJ…) are rejected here — use only on /integrations/v1 routes.
func IntegrationAPIKeyAuth(db *gorm.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				http.Error(w, "Authentication required", http.StatusUnauthorized)
				return
			}
			if strings.HasPrefix(token, "eyJ") {
				http.Error(w, "Invalid integration API token", http.StatusUnauthorized)
				return
			}
			if !strings.HasPrefix(token, "qqk_") {
				http.Error(w, "Invalid integration API token", http.StatusUnauthorized)
				return
			}
			keyID, secret, err := repository.ParseIntegrationAPIToken(token)
			if err != nil {
				http.Error(w, "Invalid integration API token", http.StatusUnauthorized)
				return
			}
			row, err := repository.FindIntegrationAPIKeyByIDForAuth(r.Context(), db, keyID)
			if err != nil {
				http.Error(w, "Invalid integration API token", http.StatusUnauthorized)
				return
			}
			if err := bcrypt.CompareHashAndPassword([]byte(row.SecretHash), []byte(secret)); err != nil {
				http.Error(w, "Invalid integration API token", http.StatusUnauthorized)
				return
			}
			ok, err := subscriptionfeatures.CompanyHasAPIAccess(r.Context(), db, row.CompanyID)
			if err != nil || !ok {
				http.Error(w, "API access is not enabled for this subscription plan", http.StatusForbidden)
				return
			}
			var scopes []string
			if len(row.Scopes) > 0 && string(row.Scopes) != "null" {
				_ = json.Unmarshal(row.Scopes, &scopes)
			}
			ctx := r.Context()
			ctx = context.WithValue(ctx, IntegrationKeyCompanyIDKey, row.CompanyID)
			ctx = context.WithValue(ctx, IntegrationKeyIDKey, row.ID)
			ctx = context.WithValue(ctx, IntegrationKeyScopesKey, scopes)
			if row.UnitID != nil {
				ctx = context.WithValue(ctx, IntegrationKeyUnitIDKey, *row.UnitID)
			}
			go func(id string) {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				_ = repository.NewIntegrationAPIKeyRepository(db).TouchLastUsed(ctx, id)
			}(row.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func bearerToken(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	const pfx = "Bearer "
	if len(authHeader) > len(pfx) && strings.EqualFold(authHeader[:len(pfx)], pfx) {
		return strings.TrimSpace(authHeader[len(pfx):])
	}
	return ""
}

// RequireIntegrationAPIScope returns 403 when the integration key lacks the given scope.
func RequireIntegrationAPIScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !IntegrationKeyHasScope(r.Context(), scope) {
				http.Error(w, "Forbidden: missing required API scope", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireIntegrationUnitBelongsToCompany ensures the path unit exists and belongs to the key's tenant.
func RequireIntegrationUnitBelongsToCompany(unitRepo repository.UnitRepository, urlUnitParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			companyID, ok := GetIntegrationKeyCompanyID(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			uid := strings.TrimSpace(chi.URLParam(r, urlUnitParam))
			if uid == "" {
				http.Error(w, "unit id required", http.StatusBadRequest)
				return
			}
			unit, err := unitRepo.FindByIDLight(uid)
			if err != nil || unit == nil || unit.CompanyID != companyID {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireIntegrationUnitURLMatch ensures URL unitId matches the key's optional unit restriction.
func RequireIntegrationUnitURLMatch(urlUnitParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			restricted, has := r.Context().Value(IntegrationKeyUnitIDKey).(string)
			if !has || strings.TrimSpace(restricted) == "" {
				next.ServeHTTP(w, r)
				return
			}
			urlUnit := strings.ToLower(strings.TrimSpace(chi.URLParam(r, urlUnitParam)))
			if urlUnit == "" || urlUnit != strings.ToLower(strings.TrimSpace(restricted)) {
				http.Error(w, "Forbidden: integration key is restricted to a different unit", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
