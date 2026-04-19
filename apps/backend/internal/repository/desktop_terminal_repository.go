package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type DesktopTerminalRepository interface {
	Create(t *models.DesktopTerminal) error
	FindAll() ([]models.DesktopTerminal, error)
	// FindAllByCompanyID lists terminals whose primary unit belongs to the company.
	FindAllByCompanyID(companyID string) ([]models.DesktopTerminal, error)
	FindByID(id string) (*models.DesktopTerminal, error)
	FindByPairingCodeDigest(digest string) (*models.DesktopTerminal, error)
	Update(t *models.DesktopTerminal) error
}

type desktopTerminalRepository struct {
	db *gorm.DB
}

func NewDesktopTerminalRepository() DesktopTerminalRepository {
	return &desktopTerminalRepository{db: database.DB}
}

func (r *desktopTerminalRepository) Create(t *models.DesktopTerminal) error {
	return r.db.Create(t).Error
}

func (r *desktopTerminalRepository) FindAll() ([]models.DesktopTerminal, error) {
	var rows []models.DesktopTerminal
	err := r.db.Preload("Unit", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
	}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *desktopTerminalRepository) FindAllByCompanyID(companyID string) ([]models.DesktopTerminal, error) {
	var rows []models.DesktopTerminal
	err := r.db.Joins("INNER JOIN units ON units.id = desktop_terminals.unit_id AND units.company_id = ?", companyID).
		Preload("Unit", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
		}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).Order("desktop_terminals.created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *desktopTerminalRepository) FindByID(id string) (*models.DesktopTerminal, error) {
	var t models.DesktopTerminal
	err := r.db.Preload("Unit", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
	}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).First(&t, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *desktopTerminalRepository) FindByPairingCodeDigest(digest string) (*models.DesktopTerminal, error) {
	var t models.DesktopTerminal
	err := r.db.First(&t, "pairing_code_digest = ?", digest).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *desktopTerminalRepository) Update(t *models.DesktopTerminal) error {
	return r.db.Save(t).Error
}
