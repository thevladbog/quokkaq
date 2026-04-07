package models

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
	Duration        *int    `json:"duration,omitempty"`       // In seconds
	MaxWaitingTime  *int    `json:"maxWaitingTime,omitempty"` // In seconds
	Prebook         bool    `gorm:"default:false" json:"prebook"`
	IsLeaf          bool    `gorm:"default:false" json:"isLeaf"`

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
	ID           string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID       string  `gorm:"not null" json:"unitId"`
	Name         string  `gorm:"not null" json:"name"`
	AssignedTo   *string `gorm:"column:assigned_to" json:"assignedTo,omitempty"`
	AssignedUser *User   `gorm:"foreignKey:AssignedTo" json:"assignedUser,omitempty"`

	// Relations
	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
