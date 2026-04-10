package models

// InvoiceNumberSequence allocates human-readable invoice numbers per calendar year (QQ-YYYY-NNNNN).
type InvoiceNumberSequence struct {
	Year    int   `gorm:"primaryKey" json:"year"`
	LastSeq int64 `gorm:"not null;default:0" json:"lastSeq"`
}
