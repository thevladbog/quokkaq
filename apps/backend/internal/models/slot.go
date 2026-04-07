package models

import (
	"time"
)

type SlotConfig struct {
	ID        string      `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string      `gorm:"not null;unique" json:"unitId"`
	StartTime string      `gorm:"not null" json:"startTime"` // HH:MM
	EndTime   string      `gorm:"not null" json:"endTime"`   // HH:MM
	Interval  int         `gorm:"not null" json:"interval"`  // in minutes
	Days      StringArray `gorm:"type:text[]" json:"days"`   // ["monday", "tuesday", ...]
	CreatedAt time.Time   `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time   `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

type WeeklySlotCapacity struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string    `gorm:"not null" json:"unitId"`
	DayOfWeek string    `gorm:"not null" json:"dayOfWeek"` // monday, tuesday, ...
	StartTime string    `gorm:"not null" json:"startTime"` // HH:MM
	ServiceID string    `gorm:"not null" json:"serviceId"`
	Capacity  int       `gorm:"default:0" json:"capacity"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

type DaySchedule struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string    `gorm:"not null" json:"unitId"`
	Date      string    `gorm:"not null" json:"date"` // YYYY-MM-DD
	IsDayOff  bool      `gorm:"default:false" json:"isDayOff"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Unit         Unit          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	ServiceSlots []ServiceSlot `gorm:"foreignKey:DayScheduleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"serviceSlots,omitempty"`
}

type ServiceSlot struct {
	ID            string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	DayScheduleID string    `gorm:"not null" json:"dayScheduleId"`
	ServiceID     string    `gorm:"not null" json:"serviceId"`
	StartTime     string    `gorm:"not null" json:"startTime"` // HH:MM
	Capacity      int       `gorm:"default:0" json:"capacity"`
	CreatedAt     time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	DaySchedule DaySchedule `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service     Service     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

type UpdateDayScheduleRequest struct {
	IsDayOff bool          `json:"isDayOff"`
	Slots    []ServiceSlot `json:"slots"`
}

type ServiceSlotWithBooking struct {
	ServiceSlot
	Booked int `json:"booked"`
}

type DayScheduleWithBookings struct {
	DaySchedule
	Slots []ServiceSlotWithBooking `json:"slots"`
}
