package models

// OperatorSkill maps an operator (user) to a service they are skilled at within a unit.
// Priority 1 = primary competency (served first), 2 = secondary, 3 = backup.
// Unique constraint: (unit_id, user_id, service_id).
type OperatorSkill struct {
	ID        string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string `gorm:"not null;uniqueIndex:uniq_op_skill,priority:1" json:"unitId"`
	UserID    string `gorm:"not null;uniqueIndex:uniq_op_skill,priority:2" json:"userId"`
	ServiceID string `gorm:"not null;uniqueIndex:uniq_op_skill,priority:3" json:"serviceId"`
	// Priority: 1 = primary, 2 = secondary, 3 = backup.
	// Lower value = higher precedence when selecting the next ticket for this operator.
	Priority int `gorm:"not null;default:1" json:"priority"`

	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	User    User    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (OperatorSkill) TableName() string {
	return "operator_skills"
}
