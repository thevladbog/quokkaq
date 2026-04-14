package models

import (
	"encoding/json"
	"time"
)

// SurveyDefinition is a survey template scoped to a subdivision or service_zone unit.
type SurveyDefinition struct {
	ID          string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID   string          `gorm:"not null;index" json:"companyId"`
	ScopeUnitID string          `gorm:"not null;index;column:scope_unit_id" json:"scopeUnitId"`
	Title       string          `gorm:"not null" json:"title"`
	Questions   json.RawMessage `gorm:"type:jsonb" json:"questions" swaggertype:"object"`
	// CompletionMessage optional per-locale Markdown shown after survey submit (e.g. {"en":"...","ru":"..."}).
	CompletionMessage json.RawMessage `gorm:"type:jsonb" json:"completionMessage,omitempty" swaggertype:"object"`
	// DisplayTheme optional JSON for counter-display terminal colors (see validateDisplayTheme).
	DisplayTheme json.RawMessage `gorm:"type:jsonb;column:display_theme" json:"displayTheme,omitempty" swaggertype:"object"`
	// IdleScreen optional JSON for counter idle carousel (text/image/video slides); see validateIdleScreen.
	IdleScreen json.RawMessage `gorm:"type:jsonb;column:idle_screen" json:"idleScreen,omitempty" swaggertype:"object"`
	IsActive   bool            `gorm:"not null;default:false" json:"isActive"`
	CreatedAt  time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
}

// SurveyResponse is one submission tied to a ticket (and optionally a known visitor).
type SurveyResponse struct {
	ID                 string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	SurveyDefinitionID string          `gorm:"not null;index;column:survey_definition_id" json:"surveyDefinitionId"`
	TicketID           string          `gorm:"not null;index;column:ticket_id" json:"ticketId"`
	CounterID          string          `gorm:"not null;column:counter_id" json:"counterId"`
	UnitID             string          `gorm:"not null;index;column:unit_id" json:"unitId"`
	ClientID           *string         `gorm:"index;column:client_id" json:"clientId,omitempty"`
	Answers            json.RawMessage `gorm:"type:jsonb" json:"answers" swaggertype:"object"`
	SubmittedAt        time.Time       `gorm:"not null" json:"submittedAt"`
}
