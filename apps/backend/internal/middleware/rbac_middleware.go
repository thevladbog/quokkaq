package middleware

import (
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// RequireTenantAdmin allows platform_admin, global legacy admin, tenant system_admin role,
// or tenant RBAC catalog permission tenant.admin on any unit (replaces RequireAdminOrTenantPermission).
func RequireTenantAdmin(userRepo repository.UserRepository, tr repository.TenantRBACRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			okPlat, err := userRepo.IsPlatformAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okPlat {
				next.ServeHTTP(w, r)
				return
			}
			okAdm, err := userRepo.IsAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okAdm {
				next.ServeHTTP(w, r)
				return
			}
			cid, err := userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
			if err != nil {
				if errors.Is(err, repository.ErrCompanyAccessDenied) {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				if repository.IsNotFound(err) {
					http.Error(w, "Not found", http.StatusNotFound)
					return
				}
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			okSys, err := userRepo.HasTenantSystemAdminRoleInCompany(userID, cid)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okSys {
				next.ServeHTTP(w, r)
				return
			}
			okTenantAdmin, err := tr.UserHasPermissionInCompany(userID, cid, rbac.PermTenantAdmin)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !okTenantAdmin {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireTenantPermission allows platform/global admin, tenant system_admin, or the given tenant-catalog permission on any unit.
func RequireTenantPermission(userRepo repository.UserRepository, tr repository.TenantRBACRepository, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			cid, err := userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
			if err != nil {
				if errors.Is(err, repository.ErrCompanyAccessDenied) {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				if repository.IsNotFound(err) {
					http.Error(w, "Not found", http.StatusNotFound)
					return
				}
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			okPerm, err := repository.TenantPermissionAllowed(userRepo, tr, userID, cid, permission)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !okPerm {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireTerminalUnitMatchOrUnitPermission allows desktop terminal JWT for the same unit as the URL,
// otherwise the same checks as RequireUnitPermission (staff users).
func RequireTerminalUnitMatchOrUnitPermission(userRepo repository.UserRepository, tr repository.TenantRBACRepository, unitRepo repository.UnitRepository, urlUnitParam string, permission string) func(http.Handler) http.Handler {
	unitPermMiddleware := RequireUnitPermission(userRepo, tr, unitRepo, urlUnitParam, permission)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			unitID := unitIDFromRequest(r, urlUnitParam)
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				got, ok := r.Context().Value(TerminalUnitIDKey).(string)
				if !ok || !strings.EqualFold(strings.TrimSpace(got), strings.TrimSpace(unitID)) {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			unitPermMiddleware(next).ServeHTTP(w, r)
		})
	}
}

func unitIDFromRequest(r *http.Request, urlUnitParam string) string {
	u := strings.TrimSpace(chi.URLParam(r, urlUnitParam))
	if u != "" {
		return u
	}
	if urlUnitParam != "id" {
		u = strings.TrimSpace(chi.URLParam(r, "id"))
	}
	return u
}

// RequireUnitPermission enforces a unit-scoped permission via user_units and tenant_role_units.
func RequireUnitPermission(userRepo repository.UserRepository, tr repository.TenantRBACRepository, unitRepo repository.UnitRepository, urlUnitParam string, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			unitID := unitIDFromRequest(r, urlUnitParam)
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			u, err := unitRepo.FindByIDLight(unitID)
			if err != nil {
				if repository.IsNotFound(err) {
					http.Error(w, "Not found", http.StatusNotFound)
					return
				}
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			okPlat, err := userRepo.IsPlatformAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okPlat {
				next.ServeHTTP(w, r)
				return
			}
			okAdm, err := userRepo.IsAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okAdm {
				next.ServeHTTP(w, r)
				return
			}
			okSys, err := userRepo.HasTenantSystemAdminRoleInCompany(userID, u.CompanyID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okSys {
				next.ServeHTTP(w, r)
				return
			}
			direct, err := userRepo.UserMatchesUnitPermission(userID, unitID, permission)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if direct {
				next.ServeHTTP(w, r)
				return
			}
			okTenant, err := tr.UserHasTenantPermission(userID, u.CompanyID, unitID, permission)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !okTenant {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireUnitStatisticsAccess requires branch membership plus any statistics scope permission (catalog or legacy zone/subdivision flags).
func RequireUnitStatisticsAccess(userRepo repository.UserRepository, tr repository.TenantRBACRepository, unitRepo repository.UnitRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ == "terminal" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			unitID := unitIDFromRequest(r, "unitId")
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			branchOk, err := userRepo.HasUnitBranchAccess(userID, unitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !branchOk {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			u, err := unitRepo.FindByIDLight(unitID)
			if err != nil {
				if repository.IsNotFound(err) {
					http.Error(w, "Not found", http.StatusNotFound)
					return
				}
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			okPlat, err := userRepo.IsPlatformAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okPlat {
				next.ServeHTTP(w, r)
				return
			}
			okAdm, err := userRepo.IsAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okAdm {
				next.ServeHTTP(w, r)
				return
			}
			okSys, err := userRepo.HasTenantSystemAdminRoleInCompany(userID, u.CompanyID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if okSys {
				next.ServeHTTP(w, r)
				return
			}
			variants := rbac.StatisticsAccessPermissionVariants()
			direct, err := userRepo.UserMatchesAnyUnitPermission(userID, unitID, variants)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if direct {
				next.ServeHTTP(w, r)
				return
			}
			for _, p := range variants {
				okTenant, err := tr.UserHasTenantPermission(userID, u.CompanyID, unitID, p)
				if err != nil {
					http.Error(w, "Internal server error", http.StatusInternalServerError)
					return
				}
				if okTenant {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, "Forbidden", http.StatusForbidden)
		})
	}
}
