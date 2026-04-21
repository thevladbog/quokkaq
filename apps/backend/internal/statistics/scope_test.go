package statistics

import (
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
)

func TestResolveScope_DeniedBlankViewerEarlyPath(t *testing.T) {
	sc := ResolveScope(nil, "sub-1", "  ", nil)
	if !sc.Denied {
		t.Fatalf("expected Denied, got %#v", sc)
	}
}

func TestResolveScope_EarlyPathSelfWhenViewerPresent(t *testing.T) {
	sc := ResolveScope(nil, "", "user-a", nil)
	if sc.Denied || sc.Expanded || sc.ForceUserID != "user-a" {
		t.Fatalf("expected self scope, got %#v", sc)
	}
}

func TestResolveScope_DeniedNoStatsPermissionBlankViewer(t *testing.T) {
	u := &models.User{
		Units: []models.UserUnit{{
			UnitID:      "branch-1",
			Permissions: models.StringArray{},
		}},
	}
	sc := ResolveScope(u, "branch-1", "", nil)
	if !sc.Denied {
		t.Fatalf("expected Denied, got %#v", sc)
	}
}

func TestResolveScope_AdminBlankViewerNotDenied(t *testing.T) {
	u := &models.User{
		Roles: []models.UserRole{{Role: models.Role{Name: "admin"}}},
	}
	sc := ResolveScope(u, "branch-1", "", nil)
	if sc.Denied || !sc.Expanded {
		t.Fatalf("expected expanded team scope, got %#v", sc)
	}
}

// Simulates tenant system_admin after TRU merge: no global Roles, but full catalog on user_units.
func TestResolveScope_ExpandedViaMergedStatisticsReadOnBranch(t *testing.T) {
	u := &models.User{
		Units: []models.UserUnit{{
			UnitID:      "branch-1",
			Permissions: models.StringArray{rbac.PermStatisticsRead},
		}},
	}
	sc := ResolveScope(u, "branch-1", "viewer-1", nil)
	if sc.Denied || !sc.Expanded || sc.ForceUserID != "" {
		t.Fatalf("expected expanded team scope from merged perms, got %#v", sc)
	}
}

func TestApplyRequestedUserID_DeniedReturnsNil(t *testing.T) {
	s := Scope{Denied: true, ForceUserID: "x"}
	if got := s.ApplyRequestedUserID(nil); got != nil {
		t.Fatalf("expected nil, got %v", got)
	}
}

func TestResolveScope_nilBranchSkipsZoneGrantsOutsideValidatedTree(t *testing.T) {
	u := &models.User{
		Units: []models.UserUnit{{
			UnitID:      "zone-child",
			Permissions: models.StringArray{PermStatisticsZone},
		}},
	}
	// Without branchUnitIDs we must not attach arbitrary service_zone user_units as statistics scope.
	sc := ResolveScope(u, "sub-root", "viewer-1", nil)
	if !sc.Denied {
		t.Fatalf("expected Denied without branch validation and no subdivision row, got %#v", sc)
	}
}

func TestResolveScope_zonePermissionOtherBranchFiltered(t *testing.T) {
	u := &models.User{
		Units: []models.UserUnit{
			{
				UnitID:      "zone-in-branch-a",
				Permissions: models.StringArray{PermStatisticsZone},
			},
		},
	}
	branchB := map[string]struct{}{
		"branch-b":         {},
		"zone-in-branch-b": {},
	}
	sc := ResolveScope(u, "branch-b", "viewer-1", branchB)
	if !sc.Denied {
		t.Fatalf("expected Denied when zone grant is outside branch, got %#v", sc)
	}
}
