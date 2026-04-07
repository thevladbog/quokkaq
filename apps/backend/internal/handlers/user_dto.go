package handlers

import (
	"quokkaq-go-backend/internal/models"
)

// UserResponse is the DTO for user API responses
type UserResponse struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Email       *string             `json:"email,omitempty"`
	Type        string              `json:"type,omitempty"`
	CreatedAt   string              `json:"createdAt,omitempty"`
	Roles       []RoleDTO           `json:"roles,omitempty"`
	Units       []UserUnitDTO       `json:"units,omitempty"`
	Permissions map[string][]string `json:"permissions,omitempty"`
}

type RoleDTO struct {
	Role RoleInfoDTO `json:"role"`
}

type RoleInfoDTO struct {
	Name string `json:"name"`
}

type UserUnitDTO struct {
	UnitID      string   `json:"unitId"`
	Permissions []string `json:"permissions,omitempty"`
}

// MapUserToResponse converts a User model to UserResponse DTO
func MapUserToResponse(user *models.User) *UserResponse {
	response := &UserResponse{
		ID:          user.ID,
		Name:        user.Name,
		Email:       user.Email,
		Type:        user.Type,
		CreatedAt:   user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Roles:       make([]RoleDTO, 0),
		Units:       make([]UserUnitDTO, 0),
		Permissions: make(map[string][]string),
	}

	// Map roles
	for _, userRole := range user.Roles {
		response.Roles = append(response.Roles, RoleDTO{
			Role: RoleInfoDTO{
				Name: userRole.Role.Name,
			},
		})
	}

	// Map units
	for _, userUnit := range user.Units {
		permissions := userUnit.Permissions
		if permissions == nil {
			permissions = []string{} // Ensure it's an empty array, not null
		}
		response.Units = append(response.Units, UserUnitDTO{
			UnitID:      userUnit.UnitID,
			Permissions: permissions,
		})

		// Populate the permissions map for easier frontend access
		response.Permissions[userUnit.UnitID] = permissions
	}

	return response
}
