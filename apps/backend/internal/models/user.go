package models

import (
	"database/sql/driver"
	"errors"
	"strings"
	"time"
)

// StringArray is a custom type for handling PostgreSQL text[]
type StringArray []string

// Scan implements the sql.Scanner interface
func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		// Handle Postgres array format {item1,item2}
		str := string(v)
		if str == "{}" {
			*a = []string{}
			return nil
		}
		// Simple parsing for now, assuming no commas in values or quoted values
		// For more complex cases, a proper parser is needed
		str = strings.Trim(str, "{}")
		*a = strings.Split(str, ",")
		return nil
	case string:
		// Handle string format if driver returns string
		if v == "{}" {
			*a = []string{}
			return nil
		}
		v = strings.Trim(v, "{}")
		*a = strings.Split(v, ",")
		return nil
	default:
		return errors.New("failed to scan StringArray")
	}
}

// Value implements the driver.Valuer interface
func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}

	// Format as Postgres array literal: {item1,item2}
	// We should quote elements to be safe, but for simple permissions it might be overkill
	// Let's do simple joining for now as permissions are usually simple strings
	return "{" + strings.Join(a, ",") + "}", nil
}

type User struct {
	ID       string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Type     string  `gorm:"default:'human'" json:"type"`
	Email    *string `gorm:"unique" json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Name     string  `gorm:"not null" json:"name"`
	PhotoURL *string `gorm:"column:photo_url" json:"photoUrl,omitempty"`
	Password *string `json:"-"` // Never expose password in JSON
	IsActive bool    `gorm:"default:true" json:"isActive"`
	// ExemptFromSSOSync when true, SSO directory reconcile does not change this user's global roles, unit assignments, or tenant role mappings (IdP group sync).
	ExemptFromSSOSync bool `gorm:"column:exempt_from_sso_sync;not null;default:false" json:"exemptFromSsoSync"`
	// SSOProfileSyncOptOut: when true, skip name/email updates from IdP on SSO login.
	SSOProfileSyncOptOut bool      `gorm:"column:sso_profile_sync_opt_out;not null;default:false" json:"ssoProfileSyncOptOut"`
	CreatedAt            time.Time `gorm:"default:now()" json:"createdAt"`

	// Relations
	Roles []UserRole `gorm:"foreignKey:UserID" json:"roles,omitempty"`
	Units []UserUnit `gorm:"foreignKey:UserID" json:"units,omitempty"`
}

// UpdateUserInput is a PATCH body: only non-nil fields are applied; Roles, when present, syncs the tenant "admin" role only.
type UpdateUserInput struct {
	Name     *string  `json:"name"`
	Email    *string  `json:"email"`
	Password *string  `json:"password"`
	PhotoURL *string  `json:"photoUrl"`
	Roles    []string `json:"roles"`
}

type Role struct {
	ID    string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Name  string     `gorm:"unique;not null" json:"name"`
	Users []UserRole `gorm:"foreignKey:RoleID" json:"-" swaggerignore:"true"`
}

type UserRole struct {
	ID     string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID string `gorm:"not null" json:"userId"`
	RoleID string `gorm:"not null" json:"roleId"`

	User User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Role Role `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"role,omitempty"`
}

type UserUnit struct {
	ID          string      `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID      string      `gorm:"not null;uniqueIndex:ux_user_units_user_unit" json:"userId"`
	UnitID      string      `gorm:"not null;uniqueIndex:ux_user_units_user_unit" json:"unitId"`
	Permissions StringArray `gorm:"type:text[]" json:"permissions,omitempty"`

	User User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"unit,omitempty"`
}
