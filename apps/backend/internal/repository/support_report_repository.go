package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// SupportReportRepository persists support report rows.
type SupportReportRepository interface {
	Create(r *models.SupportReport) error
	FindByID(id string) (*models.SupportReport, error)
	ListForUser(userID string, all bool) ([]models.SupportReport, error)
	Update(r *models.SupportReport) error
}

type supportReportRepository struct {
	db *gorm.DB
}

// NewSupportReportRepository constructs a SupportReportRepository.
func NewSupportReportRepository() SupportReportRepository {
	return &supportReportRepository{db: database.DB}
}

func (r *supportReportRepository) Create(row *models.SupportReport) error {
	return r.db.Create(row).Error
}

func (r *supportReportRepository) FindByID(id string) (*models.SupportReport, error) {
	var row models.SupportReport
	if err := r.db.Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *supportReportRepository) ListForUser(userID string, all bool) ([]models.SupportReport, error) {
	var rows []models.SupportReport
	q := r.db.Model(&models.SupportReport{}).Order("created_at DESC")
	if !all {
		q = q.Where("created_by_user_id = ?", userID)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *supportReportRepository) Update(row *models.SupportReport) error {
	return r.db.Save(row).Error
}
