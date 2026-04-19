package rbac

import "strings"

// TenantRoleSlugSystemAdmin is the reserved slug for the per-tenant full-access role ("System administrator").
// Exactly one such role exists per company; it cannot be deleted via API.
const TenantRoleSlugSystemAdmin = "system_admin"

// SystemTenantRoleNameEN is the default English display name stored in DB (UI may localize).
const SystemTenantRoleNameEN = "System Administrator"

// IsSystemTenantRoleSlug reports whether slug is the reserved system administrator role.
func IsSystemTenantRoleSlug(slug string) bool {
	return strings.TrimSpace(slug) == TenantRoleSlugSystemAdmin
}
