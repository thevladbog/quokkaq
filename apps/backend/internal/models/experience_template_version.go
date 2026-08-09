package models

import (
	"encoding/json"
	"time"
)

// ExperienceTemplateVersion is an immutable snapshot created by publish or restore.
// Definition is never updated after insertion; ScreenLayoutTemplate.Definition remains the draft.
type ExperienceTemplateVersion struct {
	ID          string          `gorm:"primaryKey;default:gen_random_uuid();uniqueIndex:uq_experience_template_versions_template_id_id,priority:2" json:"id"`
	TemplateID  string          `gorm:"not null;uniqueIndex:uq_experience_template_versions_template_version;uniqueIndex:uq_experience_template_versions_template_id_id,priority:1;index" json:"templateId"`
	Version     int             `gorm:"not null;uniqueIndex:uq_experience_template_versions_template_version" json:"version"`
	Definition  json.RawMessage `gorm:"type:jsonb;not null" json:"definition" swaggertype:"object"`
	PublishedBy string          `gorm:"not null;index" json:"publishedBy"`
	PublishedAt time.Time       `gorm:"not null;default:now();index" json:"publishedAt"`
}
