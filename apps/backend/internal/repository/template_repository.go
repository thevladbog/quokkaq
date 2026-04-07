package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type TemplateRepository interface {
	Create(template *models.MessageTemplate) error
	FindAll() ([]models.MessageTemplate, error)
	FindByID(id string) (*models.MessageTemplate, error)
	Update(template *models.MessageTemplate) error
	Delete(id string) error
	FindDefault() (*models.MessageTemplate, error)
}

type templateRepository struct {
	db *gorm.DB
}

func NewTemplateRepository() TemplateRepository {
	return &templateRepository{db: database.DB}
}

func (r *templateRepository) Create(template *models.MessageTemplate) error {
	return r.db.Create(template).Error
}

func (r *templateRepository) FindAll() ([]models.MessageTemplate, error) {
	var templates []models.MessageTemplate
	err := r.db.Find(&templates).Error
	return templates, err
}

func (r *templateRepository) FindByID(id string) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	err := r.db.First(&template, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *templateRepository) Update(template *models.MessageTemplate) error {
	return r.db.Save(template).Error
}

func (r *templateRepository) Delete(id string) error {
	return r.db.Delete(&models.MessageTemplate{}, "id = ?", id).Error
}

func (r *templateRepository) FindDefault() (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	err := r.db.Where("is_default = ?", true).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}
