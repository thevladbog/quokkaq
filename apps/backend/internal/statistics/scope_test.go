package statistics

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestResolveScope_DeniedBlankViewerEarlyPath(t *testing.T) {
	sc := ResolveScope(nil, "sub-1", "  ")
	if !sc.Denied {
		t.Fatalf("expected Denied, got %#v", sc)
	}
}

func TestResolveScope_EarlyPathSelfWhenViewerPresent(t *testing.T) {
	sc := ResolveScope(nil, "", "user-a")
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
	sc := ResolveScope(u, "branch-1", "")
	if !sc.Denied {
		t.Fatalf("expected Denied, got %#v", sc)
	}
}

func TestResolveScope_AdminBlankViewerNotDenied(t *testing.T) {
	u := &models.User{
		Roles: []models.UserRole{{Role: models.Role{Name: "admin"}}},
	}
	sc := ResolveScope(u, "branch-1", "")
	if sc.Denied || !sc.Expanded {
		t.Fatalf("expected expanded team scope, got %#v", sc)
	}
}

func TestApplyRequestedUserID_DeniedReturnsNil(t *testing.T) {
	s := Scope{Denied: true, ForceUserID: "x"}
	if got := s.ApplyRequestedUserID(nil); got != nil {
		t.Fatalf("expected nil, got %v", got)
	}
}
