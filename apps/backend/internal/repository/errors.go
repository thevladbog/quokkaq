package repository

import (
	"errors"

	"gorm.io/gorm"
)

// ErrTenantRoleNotInCompany is returned when a tenant_role_id does not exist or belongs to another company.
var ErrTenantRoleNotInCompany = errors.New("tenant role not found or not in company")

// ErrEmptyTenantRoleAssignmentNotAllowed is returned when ReplaceUserTenantRoles would clear all tenant roles without allowEmpty=true.
var ErrEmptyTenantRoleAssignmentNotAllowed = errors.New("tenant roles: empty assignment requires explicit confirmation")

// IsNotFound reports whether err is a missing-row error from GORM First/Take used by this package's FindByID methods.
func IsNotFound(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrRecordNotFound)
}
