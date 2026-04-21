package repository

import (
	"testing"

	"quokkaq-go-backend/internal/rbac"
)

type tpUserRepoStub struct {
	plat, adm, sys bool
	unitPerm       bool
	unitPermErr    error
}

func (s tpUserRepoStub) IsPlatformAdmin(string) (bool, error) { return s.plat, nil }
func (s tpUserRepoStub) IsAdmin(string) (bool, error)         { return s.adm, nil }
func (s tpUserRepoStub) HasTenantSystemAdminRoleInCompany(string, string) (bool, error) {
	return s.sys, nil
}
func (s tpUserRepoStub) UserHasUnitPermissionInCompany(_, _, _ string) (bool, error) {
	return s.unitPerm, s.unitPermErr
}

type tpTRStub struct {
	catalogOK bool
}

func (s tpTRStub) UserHasPermissionInCompany(_, _, _ string) (bool, error) {
	return s.catalogOK, nil
}

func TestTenantPermissionAllowed_PlatformAdmin(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{plat: true}, tpTRStub{}, "u", "c", rbac.PermSupportReports)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_GlobalAdmin(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{adm: true}, tpTRStub{}, "u", "c", rbac.PermTicketsRead)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_TenantSystemAdmin(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{sys: true}, tpTRStub{}, "u", "c", rbac.PermSupportReports)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_CatalogPermission(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{}, tpTRStub{catalogOK: true}, "u", "c", rbac.PermSupportReports)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_UserUnitPermissionFallback(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{unitPerm: true}, tpTRStub{catalogOK: false}, "u", "c", rbac.PermSupportReports)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_Deny(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{}, tpTRStub{catalogOK: false}, "u", "c", rbac.PermSupportReports)
	if err != nil || ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_EmptyIDs(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{plat: true}, tpTRStub{}, "", "c", rbac.PermSupportReports)
	if err != nil || ok {
		t.Fatalf("empty user: ok=%v err=%v", ok, err)
	}
}

func TestTenantPermissionAllowed_NilTRStillChecksUnit(t *testing.T) {
	t.Parallel()
	ok, err := TenantPermissionAllowed(tpUserRepoStub{unitPerm: true}, nil, "u", "c", rbac.PermSupportReports)
	if err != nil || !ok {
		t.Fatalf("got ok=%v err=%v", ok, err)
	}
}
