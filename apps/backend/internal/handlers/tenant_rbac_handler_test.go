package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const (
	testCompanyID = "co-test"
	testSysRoleID = "role-system"
	testOtherRole = "role-other"
	testActorID   = "user-actor"
	testTargetID  = "user-target"
)

// tenantRBACUserRepo embeds PanicUserRepo and overrides only methods used by tenant RBAC handlers.
type tenantRBACUserRepo struct {
	testsupport.PanicUserRepo
	resolveCompanyID    func(userID, headerCompanyID string) (string, error)
	hasCompanyAccess    func(userID, companyID string) (bool, error)
	isPlatformAdmin     func(userID string) (bool, error)
	isAdmin             func(userID string) (bool, error)
	recomputeUserActive func(userID string) error
}

func (m tenantRBACUserRepo) ResolveCompanyIDForRequest(userID, headerCompanyID string) (string, error) {
	if m.resolveCompanyID != nil {
		return m.resolveCompanyID(userID, headerCompanyID)
	}
	return m.PanicUserRepo.ResolveCompanyIDForRequest(userID, headerCompanyID)
}

func (m tenantRBACUserRepo) HasCompanyAccess(userID, companyID string) (bool, error) {
	if m.hasCompanyAccess != nil {
		return m.hasCompanyAccess(userID, companyID)
	}
	return m.PanicUserRepo.HasCompanyAccess(userID, companyID)
}

func (m tenantRBACUserRepo) IsPlatformAdmin(userID string) (bool, error) {
	if m.isPlatformAdmin != nil {
		return m.isPlatformAdmin(userID)
	}
	return m.PanicUserRepo.IsPlatformAdmin(userID)
}

func (m tenantRBACUserRepo) IsAdmin(userID string) (bool, error) {
	if m.isAdmin != nil {
		return m.isAdmin(userID)
	}
	return m.PanicUserRepo.IsAdmin(userID)
}

func (m tenantRBACUserRepo) RecomputeUserIsActive(userID string) error {
	if m.recomputeUserActive != nil {
		return m.recomputeUserActive(userID)
	}
	return m.PanicUserRepo.RecomputeUserIsActive(userID)
}

// stubTenantRBAC implements repository.TenantRBACRepository for handler tests.
type stubTenantRBAC struct {
	rolesByID map[string]*models.TenantRole

	getTenantRole            func(companyID, roleID string) (*models.TenantRole, error)
	getTenantRoleBySlug      func(companyID, slug string) (*models.TenantRole, error)
	deleteTenantRole         func(companyID, roleID string) error
	listUserTenantRoleIDs    func(userID, companyID string) ([]string, error)
	replaceUserTenantRoles   func(userID, companyID string, tenantRoleIDs []string) error
	syncUserUnits            func(userID, companyID string) error
	mapTenantRolesByUser     func(companyID string, userIDs []string) (map[string][]models.TenantRole, error)
	userHasTenantSystemAdmin func(userID, companyID string) (bool, error)
}

func (s *stubTenantRBAC) defaultGetTenantRole(companyID, roleID string) (*models.TenantRole, error) {
	if s.rolesByID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	r := s.rolesByID[roleID]
	if r == nil || r.CompanyID != companyID {
		return nil, gorm.ErrRecordNotFound
	}
	return r, nil
}

func (s *stubTenantRBAC) ListTenantRoles(string) ([]models.TenantRole, error) {
	panic("unexpected")
}
func (s *stubTenantRBAC) GetTenantRole(companyID, roleID string) (*models.TenantRole, error) {
	if s.getTenantRole != nil {
		return s.getTenantRole(companyID, roleID)
	}
	return s.defaultGetTenantRole(companyID, roleID)
}
func (s *stubTenantRBAC) CreateTenantRole(*models.TenantRole, []models.TenantRoleUnit) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) UpdateTenantRole(*models.TenantRole, []models.TenantRoleUnit) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) DeleteTenantRole(companyID, roleID string) error {
	if s.deleteTenantRole != nil {
		return s.deleteTenantRole(companyID, roleID)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) ListGroupMappings(string) ([]models.CompanySSOGroupMapping, error) {
	panic("unexpected")
}
func (s *stubTenantRBAC) UpsertGroupMapping(*models.CompanySSOGroupMapping) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) DeleteGroupMapping(string, string) error { panic("unexpected") }
func (s *stubTenantRBAC) ReplaceUserTenantRoles(userID, companyID string, tenantRoleIDs []string) error {
	if s.replaceUserTenantRoles != nil {
		return s.replaceUserTenantRoles(userID, companyID, tenantRoleIDs)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) ReplaceUserTenantRolesTx(*gorm.DB, string, string, []string) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) ListUserTenantRoleIDs(userID, companyID string) ([]string, error) {
	if s.listUserTenantRoleIDs != nil {
		return s.listUserTenantRoleIDs(userID, companyID)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) MapTenantRolesByUserForCompany(companyID string, userIDs []string) (map[string][]models.TenantRole, error) {
	if s.mapTenantRolesByUser != nil {
		return s.mapTenantRolesByUser(companyID, userIDs)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) SyncUserUnitsFromTenantRoles(userID, companyID string) error {
	if s.syncUserUnits != nil {
		return s.syncUserUnits(userID, companyID)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) SyncUserUnitsFromTenantRolesTx(*gorm.DB, string, string) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) EnsureSystemTenantRole(string) (string, error) { panic("unexpected") }
func (s *stubTenantRBAC) EnsureSystemTenantRoleTx(*gorm.DB, string) (string, error) {
	panic("unexpected")
}
func (s *stubTenantRBAC) EnsureSystemTenantRoleTRUForUnitTx(*gorm.DB, string, string) error {
	panic("unexpected")
}
func (s *stubTenantRBAC) GetTenantRoleBySlug(companyID, slug string) (*models.TenantRole, error) {
	if s.getTenantRoleBySlug != nil {
		return s.getTenantRoleBySlug(companyID, slug)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) FullTenantRoleUnitsForSystemRole(string, string) ([]models.TenantRoleUnit, error) {
	panic("unexpected")
}
func (s *stubTenantRBAC) UserHasTenantSystemAdminRole(userID, companyID string) (bool, error) {
	if s.userHasTenantSystemAdmin != nil {
		return s.userHasTenantSystemAdmin(userID, companyID)
	}
	panic("unexpected")
}
func (s *stubTenantRBAC) UserHasTenantPermission(string, string, string, string) (bool, error) {
	panic("unexpected")
}
func (s *stubTenantRBAC) UserHasPermissionInCompany(string, string, string) (bool, error) {
	panic("unexpected")
}

func ctxWithUserID(r *http.Request, userID string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), middleware.UserIDKey, userID))
}

func TestTenantRBACHTTP_DeleteTenantRole_reservedRole409(t *testing.T) {
	t.Parallel()
	tr := &stubTenantRBAC{
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			if roleID != "rid" {
				t.Fatalf("roleId %s", roleID)
			}
			return &models.TenantRole{
				ID:        roleID,
				CompanyID: companyID,
				Slug:      rbac.TenantRoleSlugSystemAdmin,
			}, nil
		},
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID: func(_, _ string) (string, error) { return testCompanyID, nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)

	r := chi.NewRouter()
	r.Delete("/tenant-roles/{roleId}", h.DeleteTenantRole)
	req := httptest.NewRequest(http.MethodDelete, "/tenant-roles/rid", nil)
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestTenantRBACHTTP_DeleteTenantRole_ok204(t *testing.T) {
	t.Parallel()
	var deleted bool
	tr := &stubTenantRBAC{
		rolesByID: map[string]*models.TenantRole{
			"custom-1": {ID: "custom-1", CompanyID: testCompanyID, Slug: "custom"},
		},
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: roleID, CompanyID: companyID, Slug: "custom"}, nil
		},
		deleteTenantRole: func(companyID, roleID string) error {
			deleted = true
			if companyID != testCompanyID || roleID != "custom-1" {
				t.Fatalf("delete %s %s", companyID, roleID)
			}
			return nil
		},
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID: func(_, _ string) (string, error) { return testCompanyID, nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)
	r := chi.NewRouter()
	r.Delete("/tenant-roles/{roleId}", h.DeleteTenantRole)
	req := httptest.NewRequest(http.MethodDelete, "/tenant-roles/custom-1", nil)
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d", w.Code)
	}
	if !deleted {
		t.Fatal("DeleteTenantRole not called")
	}
}

func TestTenantRBACHTTP_PatchUserTenantRoles_mutuallyExclusive400(t *testing.T) {
	t.Parallel()
	tr := &stubTenantRBAC{
		getTenantRoleBySlug: func(companyID, slug string) (*models.TenantRole, error) {
			if slug != rbac.TenantRoleSlugSystemAdmin {
				t.Fatalf("slug %q", slug)
			}
			return &models.TenantRole{ID: testSysRoleID, CompanyID: companyID, Slug: slug}, nil
		},
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			if roleID == testSysRoleID {
				return &models.TenantRole{ID: testSysRoleID, CompanyID: companyID, Slug: rbac.TenantRoleSlugSystemAdmin}, nil
			}
			return &models.TenantRole{ID: testOtherRole, CompanyID: companyID, Slug: "operator"}, nil
		},
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID: func(_, _ string) (string, error) { return testCompanyID, nil },
		hasCompanyAccess: func(_, _ string) (bool, error) { return true, nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)
	body := map[string][]string{"tenantRoleIds": {testSysRoleID, testOtherRole}}
	b, _ := json.Marshal(body)

	r := chi.NewRouter()
	r.Patch("/users/{userId}/tenant-roles", h.PatchUserTenantRoles)
	req := httptest.NewRequest(http.MethodPatch, "/users/"+testTargetID+"/tenant-roles", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestTenantRBACHTTP_PatchUserTenantRoles_addSystemForbidden403(t *testing.T) {
	t.Parallel()
	tr := &stubTenantRBAC{
		getTenantRoleBySlug: func(companyID, slug string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: testSysRoleID, CompanyID: companyID, Slug: slug}, nil
		},
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: roleID, CompanyID: companyID, Slug: rbac.TenantRoleSlugSystemAdmin}, nil
		},
		listUserTenantRoleIDs: func(_, _ string) ([]string, error) {
			return []string{testOtherRole}, nil // had non-system, will add system -> transition
		},
		userHasTenantSystemAdmin: func(_, _ string) (bool, error) { return false, nil },
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID: func(_, _ string) (string, error) { return testCompanyID, nil },
		hasCompanyAccess: func(_, _ string) (bool, error) { return true, nil },
		isPlatformAdmin:  func(string) (bool, error) { return false, nil },
		isAdmin:          func(string) (bool, error) { return false, nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)
	body := map[string][]string{"tenantRoleIds": {testSysRoleID}}
	b, _ := json.Marshal(body)

	r := chi.NewRouter()
	r.Patch("/users/{userId}/tenant-roles", h.PatchUserTenantRoles)
	req := httptest.NewRequest(http.MethodPatch, "/users/"+testTargetID+"/tenant-roles", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestTenantRBACHTTP_PatchUserTenantRoles_addSystemPlatformAdmin200(t *testing.T) {
	t.Parallel()
	var replaced []string
	tr := &stubTenantRBAC{
		getTenantRoleBySlug: func(companyID, slug string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: testSysRoleID, CompanyID: companyID, Slug: slug}, nil
		},
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: roleID, CompanyID: companyID, Slug: rbac.TenantRoleSlugSystemAdmin}, nil
		},
		listUserTenantRoleIDs: func(_, _ string) ([]string, error) {
			return []string{}, nil
		},
		replaceUserTenantRoles: func(userID, companyID string, ids []string) error {
			replaced = append([]string(nil), ids...)
			if userID != testTargetID || companyID != testCompanyID {
				t.Fatalf("replace user %s company %s", userID, companyID)
			}
			return nil
		},
		syncUserUnits: func(_, _ string) error { return nil },
		mapTenantRolesByUser: func(_ string, userIDs []string) (map[string][]models.TenantRole, error) {
			return map[string][]models.TenantRole{
				testTargetID: {{ID: testSysRoleID, Name: rbac.SystemTenantRoleNameEN, Slug: rbac.TenantRoleSlugSystemAdmin}},
			}, nil
		},
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID:    func(_, _ string) (string, error) { return testCompanyID, nil },
		hasCompanyAccess:    func(_, _ string) (bool, error) { return true, nil },
		isPlatformAdmin:     func(string) (bool, error) { return true, nil },
		recomputeUserActive: func(string) error { return nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)
	body := map[string][]string{"tenantRoleIds": {testSysRoleID}}
	b, _ := json.Marshal(body)

	r := chi.NewRouter()
	r.Patch("/users/{userId}/tenant-roles", h.PatchUserTenantRoles)
	req := httptest.NewRequest(http.MethodPatch, "/users/"+testTargetID+"/tenant-roles", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
	if len(replaced) != 1 || replaced[0] != testSysRoleID {
		t.Fatalf("replaced = %v", replaced)
	}
	var resp map[string][]tenantRoleBrief
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp["tenantRoles"]) != 1 || resp["tenantRoles"][0].Slug != rbac.TenantRoleSlugSystemAdmin {
		t.Fatalf("resp %#v", resp)
	}
}

func TestTenantRBACHTTP_PatchUserTenantRoles_unknownRole400(t *testing.T) {
	t.Parallel()
	tr := &stubTenantRBAC{
		getTenantRoleBySlug: func(companyID, slug string) (*models.TenantRole, error) {
			return &models.TenantRole{ID: testSysRoleID, CompanyID: companyID, Slug: slug}, nil
		},
		getTenantRole: func(companyID, roleID string) (*models.TenantRole, error) {
			if roleID == "missing" {
				return nil, gorm.ErrRecordNotFound
			}
			return nil, errors.New("unexpected")
		},
	}
	ur := tenantRBACUserRepo{
		resolveCompanyID: func(_, _ string) (string, error) { return testCompanyID, nil },
		hasCompanyAccess: func(_, _ string) (bool, error) { return true, nil },
	}
	h := NewTenantRBACHTTP(tr, ur, nil)
	body := map[string][]string{"tenantRoleIds": {"missing"}}
	b, _ := json.Marshal(body)

	r := chi.NewRouter()
	r.Patch("/users/{userId}/tenant-roles", h.PatchUserTenantRoles)
	req := httptest.NewRequest(http.MethodPatch, "/users/"+testTargetID+"/tenant-roles", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req = ctxWithUserID(req, testActorID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}
