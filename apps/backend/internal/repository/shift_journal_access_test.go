package repository

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestShiftJournalSeesAllActivityFromLoadedUser(t *testing.T) {
	unitA := "unit-a"
	otherUnit := "unit-b"

	tests := []struct {
		name   string
		user   *models.User
		unitID string
		want   bool
	}{
		{
			name:   "nil user",
			user:   nil,
			unitID: unitA,
			want:   false,
		},
		{
			name:   "empty unit",
			user:   &models.User{Roles: []models.UserRole{{Role: models.Role{Name: "admin"}}}},
			unitID: "",
			want:   false,
		},
		{
			name:   "admin role",
			user:   &models.User{Roles: []models.UserRole{{Role: models.Role{Name: "admin"}}}},
			unitID: unitA,
			want:   true,
		},
		{
			name:   "supervisor role",
			user:   &models.User{Roles: []models.UserRole{{Role: models.Role{Name: "supervisor"}}}},
			unitID: unitA,
			want:   true,
		},
		{
			name:   "platform_admin role",
			user:   &models.User{Roles: []models.UserRole{{Role: models.Role{Name: "platform_admin"}}}},
			unitID: unitA,
			want:   true,
		},
		{
			name: "operator only",
			user: &models.User{
				Roles: []models.UserRole{{Role: models.Role{Name: "operator"}}},
				Units: []models.UserUnit{{UnitID: unitA, Permissions: nil}},
			},
			unitID: unitA,
			want:   false,
		},
		{
			name: "staff only",
			user: &models.User{
				Roles: []models.UserRole{{Role: models.Role{Name: "staff"}}},
				Units: []models.UserUnit{{UnitID: unitA}},
			},
			unitID: unitA,
			want:   false,
		},
		{
			name: "operator with supervisor panel permission on unit",
			user: &models.User{
				Roles: []models.UserRole{{Role: models.Role{Name: "operator"}}},
				Units: []models.UserUnit{{
					UnitID:      unitA,
					Permissions: models.StringArray{"ACCESS_STAFF_PANEL", permAccessSupervisorPanel},
				}},
			},
			unitID: unitA,
			want:   true,
		},
		{
			name: "supervisor permission on different unit",
			user: &models.User{
				Roles: []models.UserRole{{Role: models.Role{Name: "operator"}}},
				Units: []models.UserUnit{{
					UnitID:      otherUnit,
					Permissions: models.StringArray{permAccessSupervisorPanel},
				}},
			},
			unitID: unitA,
			want:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shiftJournalSeesAllActivityFromLoadedUser(tt.user, tt.unitID); got != tt.want {
				t.Fatalf("shiftJournalSeesAllActivityFromLoadedUser() = %v, want %v", got, tt.want)
			}
		})
	}
}
