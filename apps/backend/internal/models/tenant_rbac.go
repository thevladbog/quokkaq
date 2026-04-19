package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SSO access provisioning mode for a company (directory sync policy).
const (
	SsoAccessSourceManual    = "manual"
	SsoAccessSourceSSOGroups = "sso_groups"
)

// TenantRole is a named role within one company; permissions are scoped per unit.
type TenantRole struct {
	ID          string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID   string    `gorm:"not null;uniqueIndex:ux_tenant_roles_company_slug" json:"companyId"`
	Name        string    `gorm:"not null;size:160" json:"name"`
	Slug        string    `gorm:"not null;size:80;uniqueIndex:ux_tenant_roles_company_slug" json:"slug"`
	Description string    `gorm:"size:512" json:"description,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Company Company          `gorm:"foreignKey:CompanyID" json:"-" swaggerignore:"true"`
	Units   []TenantRoleUnit `gorm:"foreignKey:TenantRoleID" json:"units,omitempty"`
}

func (t *TenantRole) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// TenantRoleUnit binds a tenant role to one unit with a permission subset.
type TenantRoleUnit struct {
	ID           string      `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	TenantRoleID string      `gorm:"not null;uniqueIndex:ux_tenant_role_units_role_unit" json:"tenantRoleId"`
	UnitID       string      `gorm:"not null;uniqueIndex:ux_tenant_role_units_role_unit" json:"unitId"`
	Permissions  StringArray `gorm:"type:text[]" json:"permissions,omitempty"`

	TenantRole TenantRole `gorm:"foreignKey:TenantRoleID" json:"-" swaggerignore:"true"`
	Unit       Unit       `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
}

func (t *TenantRoleUnit) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// UserTenantRole assigns a tenant-defined role to a user (within one company).
type UserTenantRole struct {
	ID           string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       string    `gorm:"not null;uniqueIndex:ux_user_tenant_role" json:"userId"`
	CompanyID    string    `gorm:"not null;index" json:"companyId"`
	TenantRoleID string    `gorm:"not null;uniqueIndex:ux_user_tenant_role" json:"tenantRoleId"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"createdAt"`

	User       User       `gorm:"foreignKey:UserID" json:"-" swaggerignore:"true"`
	Company    Company    `gorm:"foreignKey:CompanyID" json:"-" swaggerignore:"true"`
	TenantRole TenantRole `gorm:"foreignKey:TenantRoleID" json:"tenantRole,omitempty"`
}

func (u *UserTenantRole) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

// CompanySSOGroupMapping maps an IdP group id (e.g. Azure object id) to access.
// Exactly one of TenantRoleID or LegacyRoleName must be set (enforced in API and DB).
type CompanySSOGroupMapping struct {
	ID             string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID      string    `gorm:"not null;uniqueIndex:ux_company_sso_group" json:"companyId"`
	IdpGroupID     string    `gorm:"not null;size:512;uniqueIndex:ux_company_sso_group" json:"idpGroupId"`
	TenantRoleID   *string   `gorm:"index" json:"tenantRoleId,omitempty"`
	LegacyRoleName *string   `gorm:"size:64" json:"legacyRoleName,omitempty"` // legacy global role: staff | supervisor | operator (not admin)
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (c *CompanySSOGroupMapping) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}
