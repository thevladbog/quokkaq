package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

type CatalogRepository interface {
	Create(item *models.CatalogItem) error
	Update(item *models.CatalogItem) error
	Delete(id string) error
	FindByID(id string) (*models.CatalogItem, error)
	ListActive() ([]models.CatalogItem, error)
	ListAll(limit, offset int) ([]models.CatalogItem, int64, error)
}

type catalogRepository struct{}

func NewCatalogRepository() CatalogRepository {
	return &catalogRepository{}
}

func (r *catalogRepository) Create(item *models.CatalogItem) error {
	return database.DB.Create(item).Error
}

func (r *catalogRepository) Update(item *models.CatalogItem) error {
	return database.DB.Save(item).Error
}

func (r *catalogRepository) Delete(id string) error {
	return database.DB.Delete(&models.CatalogItem{}, "id = ?", id).Error
}

func (r *catalogRepository) FindByID(id string) (*models.CatalogItem, error) {
	var item models.CatalogItem
	err := database.DB.Preload("SubscriptionPlan").First(&item, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *catalogRepository) ListActive() ([]models.CatalogItem, error) {
	var items []models.CatalogItem
	err := database.DB.Where("is_active = ?", true).
		Order("name ASC").
		Preload("SubscriptionPlan").
		Find(&items).Error
	return items, err
}

func (r *catalogRepository) ListAll(limit, offset int) ([]models.CatalogItem, int64, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	if err := database.DB.Model(&models.CatalogItem{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []models.CatalogItem
	err := database.DB.Order("updated_at DESC").
		Preload("SubscriptionPlan").
		Limit(limit).Offset(offset).
		Find(&items).Error
	return items, total, err
}
