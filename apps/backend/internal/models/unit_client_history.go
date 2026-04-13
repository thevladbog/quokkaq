package models

import "time"

// UnitClientHistory is an audit row for CRM profile or visitor-tag changes on a unit client.
type UnitClientHistory struct {
	ID           string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID       string    `gorm:"not null" json:"unitId"`
	UnitClientID string    `gorm:"not null" json:"unitClientId"`
	ActorUserID  *string   `json:"actorUserId,omitempty"`
	Action       string    `gorm:"not null" json:"action"`
	Payload      []byte    `gorm:"type:jsonb;not null" json:"-"`
	CreatedAt    time.Time `gorm:"default:now()" json:"createdAt"`
}

func (UnitClientHistory) TableName() string {
	return "unit_client_histories"
}

// Unit client history action values (stable for API / analytics).
const (
	UnitClientHistoryActionProfileUpdated = "profile_updated"
	UnitClientHistoryActionTagsUpdated    = "tags_updated"
)
