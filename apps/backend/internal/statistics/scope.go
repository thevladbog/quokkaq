package statistics

import (
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
)

// PermStatisticsSubdivision and PermStatisticsZone are legacy SCREAMING_CASE strings used in tests
// and historical user_units rows; rbac.CanonicalPermissionVariants maps them to dot-notation catalog keys.
const (
	PermStatisticsSubdivision = "ACCESS_STATISTICS_SUBDIVISION"
	PermStatisticsZone        = "ACCESS_STATISTICS_ZONE"
)

// Tenant system_admin coverage (statistics scope):
// ResolveScope does not inspect the system_admin tenant-role slug. Users with that role receive
// statistics.read and access.statistics.* on all units through merged user_units (tenant RBAC).
// Expanded team scope is therefore reached via UserHasCanonicalUnitPermission on those catalog keys,
// or via legacy global roles (admin, platform_admin, supervisor) in user.Roles.

// Scope describes what a viewer may read for statistics APIs.
type Scope struct {
	// Denied is true when the viewer must not read statistics (e.g. missing auth context or no self scope).
	// Callers must return forbidden and must not treat ApplyRequestedUserID(nil) as team-wide access.
	Denied   bool
	Expanded bool // team mode: full unit or filtered by allowed zones
	// ForceUserID non-empty => metrics restricted to this user (self mode).
	ForceUserID string
	// AllowedZoneIDs limits rows to tickets with service_zone_id in this set (nil or empty = all zones in unit).
	AllowedZoneIDs map[string]struct{}
}

// ResolveScope computes statistics access for subdivisionID (branch), mirroring shift journal role bypass.
// When branchUnitIDs is non-nil, zone-scoped grants on user_units rows are kept only if uu.UnitID is in that set
// (subdivision root and descendants), so zone-only access from other branches does not expand the requested branch.
// Tenant system_admin users typically have statistics.read / access.statistics.* on all units via merged user_units.
func ResolveScope(user *models.User, subdivisionID string, viewerUserID string, branchUnitIDs map[string]struct{}) Scope {
	viewer := strings.TrimSpace(viewerUserID)
	if user == nil || subdivisionID == "" {
		if viewer == "" {
			return Scope{Denied: true}
		}
		return Scope{ForceUserID: viewer, Expanded: false}
	}

	out := Scope{ForceUserID: viewer, Expanded: false}

	for _, ur := range user.Roles {
		switch ur.Role.Name {
		case "admin", "platform_admin", "supervisor":
			out.Expanded = true
			out.ForceUserID = ""
			return out
		}
	}

	hasSubdiv := repository.UserHasCanonicalUnitPermission(user, subdivisionID, rbac.PermStatisticsRead) ||
		repository.UserHasCanonicalUnitPermission(user, subdivisionID, rbac.PermAccessStatsSubdivision)

	zones := make(map[string]struct{})
	for _, uu := range user.Units {
		for _, p := range uu.Permissions {
			if !repository.UserUnitPermissionsMatchCanonical([]string{p}, rbac.PermAccessStatsZone) {
				continue
			}
			if uu.UnitID == subdivisionID {
				continue
			}
			// Without a validated branch tree, do not attach zone grants from arbitrary user_units rows:
			// those may belong to another subdivision branch.
			if branchUnitIDs == nil {
				continue
			}
			if _, ok := branchUnitIDs[uu.UnitID]; !ok {
				continue
			}
			zones[uu.UnitID] = struct{}{}
		}
	}

	var hasBranchAffiliation bool
	for _, uu := range user.Units {
		if uu.UnitID == subdivisionID {
			hasBranchAffiliation = true
			break
		}
		if branchUnitIDs != nil {
			if _, ok := branchUnitIDs[uu.UnitID]; ok {
				hasBranchAffiliation = true
				break
			}
		}
	}

	if hasSubdiv {
		out.Expanded = true
		out.ForceUserID = ""
		return out
	}
	if len(zones) > 0 {
		out.Expanded = true
		out.ForceUserID = ""
		out.AllowedZoneIDs = zones
		return out
	}

	if !hasBranchAffiliation {
		return Scope{Denied: true}
	}
	if strings.TrimSpace(out.ForceUserID) == "" {
		return Scope{Denied: true}
	}
	return out
}

// ApplyRequestedUserID returns the effective filter user id for queries (empty = all in team mode).
func (s Scope) ApplyRequestedUserID(requested *string) *string {
	if s.Denied {
		return nil
	}
	if !s.Expanded {
		if s.ForceUserID == "" {
			return nil
		}
		return &s.ForceUserID
	}
	if requested != nil && strings.TrimSpace(*requested) != "" {
		u := strings.TrimSpace(*requested)
		return &u
	}
	return nil
}
