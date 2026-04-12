package models

import "time"

// Counter operator time segments for analytics (idle / break). Service time comes from tickets (confirmed_at → completed_at).
type CounterOperatorInterval struct {
	ID        string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string     `gorm:"not null;index" json:"unitId"`
	CounterID string     `gorm:"not null;index" json:"counterId"`
	UserID    string     `gorm:"not null" json:"userId"`
	Kind      string     `gorm:"not null" json:"kind"` // idle | break
	StartedAt time.Time  `gorm:"not null" json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`
}

func (CounterOperatorInterval) TableName() string {
	return "counter_operator_intervals"
}

const (
	OperatorIntervalKindIdle  = "idle"
	OperatorIntervalKindBreak = "break"
)
