package models

import (
	"time"
)

type PasswordResetToken struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    string    `gorm:"not null" json:"userId"`
	Token     string    `gorm:"unique;not null" json:"token"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`

	User User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}
