package models

import (
	"time"
)

type Booking struct {
	ID          string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserName    *string    `json:"userName,omitempty"`
	UserPhone   *string    `json:"userPhone,omitempty"`
	UnitID      string     `gorm:"not null" json:"unitId"`
	ServiceID   string     `gorm:"not null" json:"serviceId"`
	ScheduledAt *time.Time `json:"scheduledAt,omitempty"`
	Status      string     `gorm:"default:'confirmed'" json:"status"`
	Code        string     `gorm:"unique;not null" json:"code"`
	CreatedAt   time.Time  `gorm:"default:now()" json:"createdAt"`

	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
