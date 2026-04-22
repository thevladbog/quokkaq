package models

import (
	"encoding/json"
	"time"
)

// Playlist groups UnitMaterial items for digital signage rotation.
type Playlist struct {
	ID          string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID      string    `gorm:"not null;index" json:"unitId"`
	Name        string    `gorm:"not null" json:"name"`
	Description string    `gorm:"not null;default:''" json:"description"`
	IsDefault   bool      `gorm:"not null;default:false" json:"isDefault"`
	CreatedAt   time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updatedAt"`

	Unit  Unit           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	Items []PlaylistItem `gorm:"foreignKey:PlaylistID" json:"items,omitempty"`
}

// PlaylistItem is one slide in a playlist; duration is seconds (0 = video auto / image fallback from unit config).
type PlaylistItem struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	PlaylistID string `gorm:"not null;index" json:"playlistId"`
	MaterialID string `gorm:"not null" json:"materialId"`
	SortOrder  int    `gorm:"not null;default:0" json:"sortOrder"`
	Duration   int    `gorm:"not null;default:10" json:"duration"`

	Playlist Playlist     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	Material UnitMaterial `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"material,omitempty"`
}

// PlaylistSchedule maps a playlist to a weekly time window in the unit's timezone.
type PlaylistSchedule struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID     string `gorm:"not null;index" json:"unitId"`
	PlaylistID string `gorm:"not null;index" json:"playlistId"`
	// Comma-separated weekday numbers 1=Mon .. 7=Sun (e.g. "1,2,3,4,5").
	DaysOfWeek string    `gorm:"not null;default:'1,2,3,4,5,6,7'" json:"daysOfWeek"`
	StartTime  string    `gorm:"not null" json:"startTime"` // "HH:MM"
	EndTime    string    `gorm:"not null" json:"endTime"`   // "HH:MM"
	Priority   int       `gorm:"not null;default:0" json:"priority"`
	IsActive   bool      `gorm:"not null;default:true" json:"isActive"`
	CreatedAt  time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt  time.Time `gorm:"default:now()" json:"updatedAt"`

	Unit     Unit     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	Playlist Playlist `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"playlist,omitempty"`
}

// ExternalFeed is RSS, weather, or a generic URL polled into CachedData.
type ExternalFeed struct {
	ID                  string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID              string          `gorm:"not null;index" json:"unitId"`
	Name                string          `gorm:"not null" json:"name"`
	Type                string          `gorm:"not null" json:"type"` // rss | weather | custom_url
	URL                 string          `gorm:"not null" json:"url"`
	PollInterval        int             `gorm:"not null;default:300" json:"pollInterval"`
	Config              json.RawMessage `gorm:"type:jsonb" json:"config,omitempty" swaggertype:"object"`
	CachedData          json.RawMessage `gorm:"type:jsonb" json:"cachedData,omitempty" swaggertype:"object"`
	LastError           string          `gorm:"not null;default:''" json:"lastError,omitempty"`
	ConsecutiveFailures int             `gorm:"not null;default:0" json:"consecutiveFailures"`
	LastFetchAt         *time.Time      `json:"lastFetchAt,omitempty"`
	IsActive            bool            `gorm:"not null;default:true" json:"isActive"`
	CreatedAt           time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt           time.Time       `gorm:"default:now()" json:"updatedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}

// ScreenAnnouncement is a text banner on the public ticket screen.
type ScreenAnnouncement struct {
	ID        string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string     `gorm:"not null;index" json:"unitId"`
	Text      string     `gorm:"not null" json:"text"`
	Priority  int        `gorm:"not null;default:0" json:"priority"`
	Style     string     `gorm:"not null;default:'info'" json:"style"`
	StartsAt  *time.Time `json:"startsAt,omitempty"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
	IsActive  bool       `gorm:"not null;default:true" json:"isActive"`
	CreatedAt time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time  `gorm:"default:now()" json:"updatedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}
