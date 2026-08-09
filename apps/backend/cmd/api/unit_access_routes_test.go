package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
)

type unitAccessRouteUserRepository struct {
	repository.UserRepository
	permission string
}

func (r unitAccessRouteUserRepository) IsPlatformAdmin(string) (bool, error) {
	return false, nil
}

func (r unitAccessRouteUserRepository) IsAdmin(string) (bool, error) {
	return false, nil
}

func (r unitAccessRouteUserRepository) HasTenantSystemAdminRoleInCompany(string, string) (bool, error) {
	return false, nil
}

func (r unitAccessRouteUserRepository) UserMatchesUnitPermission(_, _, permission string) (bool, error) {
	return r.permission == permission, nil
}

func (r unitAccessRouteUserRepository) UserMatchesAnyUnitPermission(_, _ string, permissions []string) (bool, error) {
	for _, permission := range permissions {
		if r.permission == permission {
			return true, nil
		}
	}
	return false, nil
}

type unitAccessRouteTenantRepository struct {
	repository.TenantRBACRepository
}

func (unitAccessRouteTenantRepository) UserHasTenantPermission(string, string, string, string) (bool, error) {
	return false, nil
}

type unitAccessRouteUnitRepository struct {
	repository.UnitRepository
}

func (unitAccessRouteUnitRepository) FindByIDLight(id string) (*models.Unit, error) {
	return &models.Unit{ID: id, CompanyID: "company-1"}, nil
}

func TestUnitAccessRoutesKeepServiceReadsSeparateFromKioskOperations(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		permission string
		wantStatus int
	}{
		{name: "staff reads services", method: http.MethodGet, path: "/units/unit-1/services", permission: rbac.PermAccessStaffPanel, wantStatus: http.StatusNoContent},
		{name: "kiosk reads services", method: http.MethodGet, path: "/units/unit-1/services", permission: rbac.PermAccessKiosk, wantStatus: http.StatusNoContent},
		{name: "services reject unrelated permission", method: http.MethodGet, path: "/units/unit-1/services", permission: rbac.PermTicketsRead, wantStatus: http.StatusForbidden},
		{name: "staff reads services tree", method: http.MethodGet, path: "/units/unit-1/services-tree", permission: rbac.PermAccessStaffPanel, wantStatus: http.StatusNoContent},
		{name: "kiosk reads services tree", method: http.MethodGet, path: "/units/unit-1/services-tree", permission: rbac.PermAccessKiosk, wantStatus: http.StatusNoContent},
		{name: "services tree rejects unrelated permission", method: http.MethodGet, path: "/units/unit-1/services-tree", permission: rbac.PermTicketsRead, wantStatus: http.StatusForbidden},
		{name: "kiosk posts printer telemetry", method: http.MethodPost, path: "/units/unit-1/kiosk-printer-telemetry", permission: rbac.PermAccessKiosk, wantStatus: http.StatusNoContent},
		{name: "staff cannot post printer telemetry", method: http.MethodPost, path: "/units/unit-1/kiosk-printer-telemetry", permission: rbac.PermAccessStaffPanel, wantStatus: http.StatusForbidden},
		{name: "kiosk posts telemetry", method: http.MethodPost, path: "/units/unit-1/kiosk-telemetry", permission: rbac.PermAccessKiosk, wantStatus: http.StatusNoContent},
		{name: "staff cannot post telemetry", method: http.MethodPost, path: "/units/unit-1/kiosk-telemetry", permission: rbac.PermAccessStaffPanel, wantStatus: http.StatusForbidden},
		{name: "kiosk resolves employee IdP", method: http.MethodPost, path: "/units/unit-1/employee-idp/resolve", permission: rbac.PermAccessKiosk, wantStatus: http.StatusNoContent},
		{name: "staff cannot resolve employee IdP", method: http.MethodPost, path: "/units/unit-1/employee-idp/resolve", permission: rbac.PermAccessStaffPanel, wantStatus: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userRepo := unitAccessRouteUserRepository{permission: tt.permission}
			unitRepo := unitAccessRouteUnitRepository{}
			router := chi.NewRouter()
			router.Route("/units", func(r chi.Router) {
				registerUnitAccessRoutes(
					r,
					func(next http.Handler) http.Handler {
						return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
							ctx := context.WithValue(req.Context(), authmiddleware.UserIDKey, "user-1")
							next.ServeHTTP(w, req.WithContext(ctx))
						})
					},
					authmiddleware.RequireTerminalUnitMatchOrUnitAnyPermission(
						userRepo,
						unitAccessRouteTenantRepository{},
						unitRepo,
						"unitId",
						[]string{rbac.PermAccessKiosk, rbac.PermAccessStaffPanel},
					),
					authmiddleware.RequireTerminalUnitMatchOrUnitPermission(
						userRepo,
						unitAccessRouteTenantRepository{},
						unitRepo,
						"unitId",
						rbac.PermAccessKiosk,
					),
					func(next http.Handler) http.Handler { return next },
					unitAccessRouteHandlers{
						getServicesByUnit:            noContentHandler,
						getServicesTreeByUnit:        noContentHandler,
						postKioskPrinterTelemetry:    noContentHandler,
						postKioskTelemetry:           noContentHandler,
						postPublicEmployeeIDPResolve: noContentHandler,
					},
				)
			})

			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func noContentHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
