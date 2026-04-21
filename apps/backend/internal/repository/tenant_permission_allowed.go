package repository

import "strings"

// TenantCatalogPermissionChecker is the minimal surface for catalog permission checks
// (implemented by TenantRBACRepository).
type TenantCatalogPermissionChecker interface {
	UserHasPermissionInCompany(userID, companyID, permission string) (bool, error)
}

// TenantPermissionUserDeps is the subset of UserRepository needed for TenantPermissionAllowed
// (also implemented by *userRepository).
type TenantPermissionUserDeps interface {
	IsPlatformAdmin(userID string) (bool, error)
	IsAdmin(userID string) (bool, error)
	HasTenantSystemAdminRoleInCompany(userID, companyID string) (bool, error)
	UserHasUnitPermissionInCompany(userID, companyID, canonicalPerm string) (bool, error)
}

// TenantPermissionAllowed mirrors RequireTenantPermission: platform admin, legacy global admin,
// tenant system_admin, tenant-role catalog permission on any unit, or the same canonical permission on user_units.
func TenantPermissionAllowed(
	userRepo TenantPermissionUserDeps,
	tr TenantCatalogPermissionChecker,
	userID, companyID, permission string,
) (bool, error) {
	userID, companyID = strings.TrimSpace(userID), strings.TrimSpace(companyID)
	permission = strings.TrimSpace(permission)
	if userID == "" || companyID == "" || permission == "" {
		return false, nil
	}
	ok, err := userRepo.IsPlatformAdmin(userID)
	if err != nil || ok {
		return ok, err
	}
	ok, err = userRepo.IsAdmin(userID)
	if err != nil || ok {
		return ok, err
	}
	ok, err = userRepo.HasTenantSystemAdminRoleInCompany(userID, companyID)
	if err != nil || ok {
		return ok, err
	}
	if tr != nil {
		ok, err = tr.UserHasPermissionInCompany(userID, companyID, permission)
		if err != nil || ok {
			return ok, err
		}
	}
	return userRepo.UserHasUnitPermissionInCompany(userID, companyID, permission)
}
