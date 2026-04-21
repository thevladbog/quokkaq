package handlers

import (
	"time"

	"quokkaq-go-backend/internal/models"
)

// TenantRoleBriefResponse is a tenant-defined role (id, name, slug) for the active company on /auth/me.
type TenantRoleBriefResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// UserResponse is the DTO for user API responses
type UserResponse struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     *string `json:"email,omitempty"`
	Type      string  `json:"type,omitempty"`
	CreatedAt string  `json:"createdAt,omitempty"`
	PhotoURL  *string `json:"photoUrl,omitempty"`
	// Roles is deprecated; use tenantRoles and unit permissions instead.
	Roles       []RoleDTO                 `json:"roles,omitempty" extensions:"x-deprecated=true"`
	Units       []UserUnitDTO             `json:"units,omitempty"`
	Permissions map[string][]string       `json:"permissions,omitempty"`
	TenantRoles []TenantRoleBriefResponse `json:"tenantRoles,omitempty"`
}

type RoleDTO struct {
	Role RoleInfoDTO `json:"role"`
}

type RoleInfoDTO struct {
	Name string `json:"name"`
}

// UnitSummaryDTO is nested under user units for display (names, codes).
type UnitSummaryDTO struct {
	ID     string  `json:"id,omitempty"`
	Name   string  `json:"name,omitempty"`
	NameEn *string `json:"nameEn,omitempty"`
	Code   string  `json:"code,omitempty"`
	Kind   string  `json:"kind,omitempty"`
}

type UserUnitDTO struct {
	UnitID      string          `json:"unitId"`
	CompanyID   string          `json:"companyId,omitempty"`
	Permissions []string        `json:"permissions,omitempty"`
	Unit        *UnitSummaryDTO `json:"unit,omitempty"`
}

// MapUserToResponse converts a User model to UserResponse DTO
func MapUserToResponse(user *models.User) *UserResponse {
	response := &UserResponse{
		ID:          user.ID,
		Name:        user.Name,
		Email:       user.Email,
		Type:        user.Type,
		CreatedAt:   user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		PhotoURL:    user.PhotoURL,
		Roles:       make([]RoleDTO, 0),
		Units:       make([]UserUnitDTO, 0),
		Permissions: make(map[string][]string),
	}

	// Map legacy global roles (required for /auth/me: frontend derives isPlatformAdmin from role names).
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
		uu := UserUnitDTO{
			UnitID:      userUnit.UnitID,
			Permissions: permissions,
		}
		if userUnit.Unit.ID != "" && userUnit.Unit.CompanyID != "" {
			uu.CompanyID = userUnit.Unit.CompanyID
		}
		if userUnit.Unit.ID != "" {
			uu.Unit = &UnitSummaryDTO{
				ID:     userUnit.Unit.ID,
				Name:   userUnit.Unit.Name,
				NameEn: userUnit.Unit.NameEn,
				Code:   userUnit.Unit.Code,
				Kind:   userUnit.Unit.Kind,
			}
		}
		response.Units = append(response.Units, uu)

		// Populate the permissions map for easier frontend access
		response.Permissions[userUnit.UnitID] = permissions
	}

	return response
}

// CompanyUserListItem is the response row for GET /companies/me/users (listing only; no internal SSO fields).
type CompanyUserListItem struct {
	ID          string                    `json:"id"`
	Name        string                    `json:"name"`
	Email       *string                   `json:"email,omitempty"`
	Type        string                    `json:"type,omitempty"`
	PhotoURL    *string                   `json:"photoUrl,omitempty"`
	IsActive    bool                      `json:"isActive"`
	CreatedAt   string                    `json:"createdAt,omitempty"`
	TenantRoles []TenantRoleBriefResponse `json:"tenantRoles,omitempty"`
}

func userToCompanyUserListItem(u models.User, tenantRoles []TenantRoleBriefResponse) CompanyUserListItem {
	item := CompanyUserListItem{
		ID:          u.ID,
		Name:        u.Name,
		Email:       u.Email,
		Type:        u.Type,
		PhotoURL:    u.PhotoURL,
		IsActive:    u.IsActive,
		TenantRoles: tenantRoles,
	}
	if !u.CreatedAt.IsZero() {
		item.CreatedAt = u.CreatedAt.UTC().Format(time.RFC3339)
	}
	return item
}
