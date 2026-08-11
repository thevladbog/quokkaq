package models

import (
	"encoding/json"
	"time"
)

// ExperienceTemplateVersion is an immutable snapshot created by publish or restore.
// Definition is never updated after insertion; ScreenLayoutTemplate.Definition remains the draft.
type ExperienceTemplateVersion struct {
	ID          string          `gorm:"primaryKey;default:gen_random_uuid();uniqueIndex:uq_experience_template_versions_template_id_id,priority:2" json:"id"`
	TemplateID  string          `gorm:"not null;uniqueIndex:uq_experience_template_versions_template_version;uniqueIndex:uq_experience_template_versions_template_id_id,priority:1;index;index:idx_experience_template_versions_published_at,priority:1" json:"templateId"`
	Version     int             `gorm:"not null;uniqueIndex:uq_experience_template_versions_template_version" json:"version"`
	Definition  json.RawMessage `gorm:"type:jsonb;not null" json:"definition" swaggertype:"object"`
	PublishedBy *string         `gorm:"index" json:"publishedBy" extensions:"x-nullable"`
	PublishedAt time.Time       `gorm:"not null;default:now();index:idx_experience_template_versions_published_at,priority:2,sort:desc" json:"publishedAt"`
}

// ExperienceTemplateVersionMetadata is the bounded version-history projection.
// Definitions are intentionally available only through owned publish/restore/runtime paths.
type ExperienceTemplateVersionMetadata struct {
	ID          string    `json:"id"`
	TemplateID  string    `json:"templateId"`
	Version     int       `json:"version"`
	PublishedBy *string   `json:"publishedBy" extensions:"x-nullable"`
	PublishedAt time.Time `json:"publishedAt"`
}

// ExperienceTemplateVersionPage is a deterministic descending version page.
type ExperienceTemplateVersionPage struct {
	Items             []ExperienceTemplateVersionMetadata `json:"items"`
	NextBeforeVersion *int                                `json:"nextBeforeVersion" binding:"required" extensions:"x-nullable"`
	HasMore           bool                                `json:"hasMore"`
}
