package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type ServiceRepository interface {
	Create(service *models.Service) error
	FindAllByUnit(unitID string) ([]models.Service, error)
	FindByID(id string) (*models.Service, error)
	FindByIDTx(tx *gorm.DB, id string) (*models.Service, error)
	Update(service *models.Service) error
	Delete(id string) error
}

type serviceRepository struct {
	db *gorm.DB
}

func NewServiceRepository() ServiceRepository {
	return &serviceRepository{db: database.DB}
}

func (r *serviceRepository) Create(service *models.Service) error {
	return r.db.Create(service).Error
}

func (r *serviceRepository) FindAllByUnit(unitID string) ([]models.Service, error) {
	var services []models.Service
	err := r.db.Where("unit_id = ?", unitID).Find(&services).Error
	return services, err
}

func (r *serviceRepository) FindByID(id string) (*models.Service, error) {
	return r.FindByIDTx(r.db, id)
}

func (r *serviceRepository) FindByIDTx(tx *gorm.DB, id string) (*models.Service, error) {
	var service models.Service
	err := tx.First(&service, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &service, nil
}

func (r *serviceRepository) Update(service *models.Service) error {
	// Use Updates to update only the provided fields without touching associations
	return r.db.Model(&models.Service{}).Where("id = ?", service.ID).Updates(service).Error
}

func (r *serviceRepository) Delete(id string) error {
	return r.db.Delete(&models.Service{}, "id = ?", id).Error
}
