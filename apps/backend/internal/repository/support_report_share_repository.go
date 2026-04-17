package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// SupportReportShareRepository persists share rows for support reports.
type SupportReportShareRepository interface {
	Create(row *models.SupportReportShare) error
	DeleteByReportAndUser(reportID, userID string) error
	ListByReportID(reportID string) ([]models.SupportReportShare, error)
	Exists(reportID, sharedWithUserID string) (bool, error)
}

type supportReportShareRepository struct {
	db *gorm.DB
}

// NewSupportReportShareRepository constructs SupportReportShareRepository.
func NewSupportReportShareRepository() SupportReportShareRepository {
	return &supportReportShareRepository{db: database.DB}
}

func (r *supportReportShareRepository) Create(row *models.SupportReportShare) error {
	return r.db.Create(row).Error
}

func (r *supportReportShareRepository) DeleteByReportAndUser(reportID, userID string) error {
	return r.db.Where("support_report_id = ? AND shared_with_user_id = ?", reportID, userID).
		Delete(&models.SupportReportShare{}).Error
}

func (r *supportReportShareRepository) ListByReportID(reportID string) ([]models.SupportReportShare, error) {
	var rows []models.SupportReportShare
	err := r.db.Where("support_report_id = ?", reportID).Order("created_at ASC").Find(&rows).Error
	return rows, err
}

func (r *supportReportShareRepository) Exists(reportID, sharedWithUserID string) (bool, error) {
	var n int64
	err := r.db.Model(&models.SupportReportShare{}).
		Where("support_report_id = ? AND shared_with_user_id = ?", reportID, sharedWithUserID).
		Count(&n).Error
	return n > 0, err
}
