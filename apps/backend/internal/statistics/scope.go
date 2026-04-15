package statistics

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

const (
	PermStatisticsSubdivision = "ACCESS_STATISTICS_SUBDIVISION"
	PermStatisticsZone        = "ACCESS_STATISTICS_ZONE"
)

// Scope describes what a viewer may read for statistics APIs.
type Scope struct {
	Expanded bool // team mode: full unit or filtered by allowed zones
	// ForceUserID non-empty => metrics restricted to this user (self mode).
	ForceUserID string
	// AllowedZoneIDs limits rows to tickets with service_zone_id in this set (nil or empty = all zones in unit).
	AllowedZoneIDs map[string]struct{}
}

// ResolveScope computes statistics access for subdivisionID (branch), mirroring shift journal role bypass.
func ResolveScope(user *models.User, subdivisionID string, viewerUserID string) Scope {
	out := Scope{ForceUserID: strings.TrimSpace(viewerUserID), Expanded: false}
	if user == nil || subdivisionID == "" {
		return out
	}

	for _, ur := range user.Roles {
		switch ur.Role.Name {
		case "admin", "platform_admin", "supervisor":
			out.Expanded = true
			out.ForceUserID = ""
			return out
		}
	}

	hasSubdiv := false
	zones := make(map[string]struct{})
	for _, uu := range user.Units {
		if uu.UnitID != subdivisionID {
			continue
		}
		for _, p := range uu.Permissions {
			switch strings.TrimSpace(p) {
			case PermStatisticsSubdivision:
				hasSubdiv = true
			}
		}
	}
	for _, uu := range user.Units {
		for _, p := range uu.Permissions {
			if strings.TrimSpace(p) != PermStatisticsZone {
				continue
			}
			if uu.UnitID == subdivisionID {
				continue
			}
			zones[uu.UnitID] = struct{}{}
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

	return out
}

// ApplyRequestedUserID returns the effective filter user id for queries (empty = all in team mode).
func (s Scope) ApplyRequestedUserID(requested *string) *string {
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
