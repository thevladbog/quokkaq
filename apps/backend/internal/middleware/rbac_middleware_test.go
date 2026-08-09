package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/go-chi/chi/v5"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
)

type serviceReadUserRepository struct {
	repository.UserRepository
	directPermission string
	permissions      []string
}

func (r *serviceReadUserRepository) IsPlatformAdmin(string) (bool, error) {
	return false, nil
}

func (r *serviceReadUserRepository) IsAdmin(string) (bool, error) {
	return false, nil
}

func (r *serviceReadUserRepository) HasTenantSystemAdminRoleInCompany(string, string) (bool, error) {
	return false, nil
}

func (r *serviceReadUserRepository) UserMatchesAnyUnitPermission(_, _ string, permissions []string) (bool, error) {
	r.permissions = append([]string(nil), permissions...)
	for _, permission := range permissions {
		if permission == r.directPermission {
			return true, nil
		}
	}
	return false, nil
}

type serviceReadTenantRepository struct {
	repository.TenantRBACRepository
}

func (serviceReadTenantRepository) UserHasTenantPermission(string, string, string, string) (bool, error) {
	return false, nil
}

type serviceReadUnitRepository struct {
	repository.UnitRepository
}

func (serviceReadUnitRepository) FindByIDLight(string) (*models.Unit, error) {
	return &models.Unit{ID: "unit-1", CompanyID: "company-1"}, nil
}

func TestRequireTerminalUnitMatchOrUnitAnyPermission(t *testing.T) {
	permissions := []string{rbac.PermAccessKiosk, rbac.PermAccessStaffPanel}

	tests := []struct {
		name             string
		tokenType        string
		terminalUnitID   string
		userID           string
		directPermission string
		wantStatus       int
		wantChecked      bool
	}{
		{
			name:           "allows a terminal bound to the requested unit",
			tokenType:      "terminal",
			terminalUnitID: "unit-1",
			wantStatus:     http.StatusOK,
		},
		{
			name:           "forbids a terminal bound to another unit",
			tokenType:      "terminal",
			terminalUnitID: "unit-2",
			wantStatus:     http.StatusForbidden,
		},
		{
			name:             "allows a user with direct kiosk access",
			userID:           "user-1",
			directPermission: rbac.PermAccessKiosk,
			wantStatus:       http.StatusOK,
			wantChecked:      true,
		},
		{
			name:             "allows a user with direct staff panel access",
			userID:           "user-1",
			directPermission: rbac.PermAccessStaffPanel,
			wantStatus:       http.StatusOK,
			wantChecked:      true,
		},
		{
			name:        "forbids a user without service read permissions",
			userID:      "user-1",
			wantStatus:  http.StatusForbidden,
			wantChecked: true,
		},
		{
			name:       "requires a user identity",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userRepo := &serviceReadUserRepository{directPermission: tt.directPermission}
			middleware := RequireTerminalUnitMatchOrUnitAnyPermission(
				userRepo,
				serviceReadTenantRepository{},
				serviceReadUnitRepository{},
				"unitId",
				permissions,
			)

			req := httptest.NewRequest(http.MethodGet, "/units/unit-1/services", nil)
			routeCtx := chi.NewRouteContext()
			routeCtx.URLParams.Add("unitId", "unit-1")
			ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
			if tt.tokenType != "" {
				ctx = context.WithValue(ctx, TokenTypeKey, tt.tokenType)
			}
			if tt.terminalUnitID != "" {
				ctx = context.WithValue(ctx, TerminalUnitIDKey, tt.terminalUnitID)
			}
			if tt.userID != "" {
				ctx = context.WithValue(ctx, UserIDKey, tt.userID)
			}
			req = req.WithContext(ctx)

			rec := httptest.NewRecorder()
			middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})).ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantChecked && !reflect.DeepEqual(userRepo.permissions, permissions) {
				t.Fatalf("checked permissions = %v, want %v", userRepo.permissions, permissions)
			}
			if !tt.wantChecked && userRepo.permissions != nil {
				t.Fatalf("checked permissions = %v, want no permission check", userRepo.permissions)
			}
		})
	}
}
