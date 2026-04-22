package models

import "time"

// AnomalyAlert persists operational anomaly signals (spike, slow service, mass no-show) for statistics UI and audit.
type AnomalyAlert struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string    `gorm:"not null;index" json:"unitId"`
	Kind      string    `gorm:"not null" json:"kind"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Severity  string    `gorm:"not null;default:'warning'" json:"severity"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (AnomalyAlert) TableName() string {
	return "anomaly_alerts"
}
