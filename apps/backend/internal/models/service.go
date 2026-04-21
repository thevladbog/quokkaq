package models

import "time"

type Service struct {
	ID              string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID          string  `gorm:"not null" json:"unitId"`
	ParentID        *string `json:"parentId,omitempty"`
	Name            string  `gorm:"not null" json:"name"`
	NameRu          *string `json:"nameRu,omitempty"`
	NameEn          *string `json:"nameEn,omitempty"`
	Description     *string `json:"description,omitempty"`
	DescriptionRu   *string `json:"descriptionRu,omitempty"`
	DescriptionEn   *string `json:"descriptionEn,omitempty"`
	ImageUrl        *string `json:"imageUrl,omitempty"`
	BackgroundColor *string `json:"backgroundColor,omitempty"`
	TextColor       *string `json:"textColor,omitempty"`
	Prefix          *string `json:"prefix,omitempty"`
	NumberSequence  *string `json:"numberSequence,omitempty"`
	Duration        *int    `json:"duration,omitempty"`       // In seconds (expected / nominal service length for progress display)
	MaxWaitingTime  *int    `json:"maxWaitingTime,omitempty"` // In seconds (queue-wait SLA — copied to Ticket.MaxWaitingTime on create)
	MaxServiceTime  *int    `json:"maxServiceTime,omitempty"` // In seconds (service-time SLA — copied to Ticket.MaxServiceTime on in_service)
	Prebook         bool    `gorm:"default:false" json:"prebook"`
	// CalendarSlotKey optional label segment in [QQ] SUMMARY when names collide (calendar integration).
	// When non-empty (after trim), it must be unique per unit — enforced by DB partial unique index and create/update validation.
	CalendarSlotKey     *string `json:"calendarSlotKey,omitempty" gorm:"column:calendar_slot_key"`
	OfferIdentification bool    `gorm:"default:false" json:"offerIdentification"`
	IsLeaf              bool    `gorm:"default:false" json:"isLeaf"`
	// RestrictedServiceZoneID: when set, this leaf service is only offered in that service_zone's waiting pool (child of UnitID subdivision).
	RestrictedServiceZoneID *string `json:"restrictedServiceZoneId,omitempty" gorm:"column:restricted_service_zone_id"`

	// Grid configuration
	GridRow     *int `json:"gridRow,omitempty"`
	GridCol     *int `json:"gridCol,omitempty"`
	GridRowSpan *int `json:"gridRowSpan,omitempty"`
	GridColSpan *int `json:"gridColSpan,omitempty"`

	// Relations
	Unit     Unit      `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Parent   *Service  `gorm:"foreignKey:ParentID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"parent,omitempty" swaggerignore:"true"`
	Children []Service `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

type Counter struct {
	ID     string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID string `gorm:"not null" json:"unitId"`
	// ServiceZoneID: when set, this counter serves only the waiting pool for that service_zone (direct child of UnitID).
	ServiceZoneID *string `json:"serviceZoneId,omitempty" gorm:"column:service_zone_id"`
	Name          string  `gorm:"not null" json:"name"`
	AssignedTo    *string `gorm:"column:assigned_to" json:"assignedTo,omitempty"`
	OnBreak       bool    `gorm:"default:false" json:"onBreak"`
	// BreakStartedAt is hydrated for JSON when OnBreak is true (open break interval); not stored on counters row.
	BreakStartedAt *time.Time `json:"breakStartedAt,omitempty" gorm:"-" swaggerignore:"true"`
	AssignedUser   *User      `gorm:"foreignKey:AssignedTo" json:"assignedUser,omitempty"`

	// Relations
	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
