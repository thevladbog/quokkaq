package repository

// SupportReportShareCandidate is a user who may receive a support report share (same company, support roles).
type SupportReportShareCandidate struct {
	UserID string `json:"userId" gorm:"column:user_id"`
	Name   string `json:"name" gorm:"column:name"`
	Email  string `json:"email,omitempty" gorm:"column:email"`
}
