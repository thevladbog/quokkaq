package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

type PreRegistrationRepository struct{}

func NewPreRegistrationRepository() *PreRegistrationRepository {
	return &PreRegistrationRepository{}
}

func (r *PreRegistrationRepository) GetByUnitID(unitID string) ([]models.PreRegistration, error) {
	var preRegistrations []models.PreRegistration
	err := database.DB.Where("unit_id = ?", unitID).
		Preload("Service").
		Preload("Ticket").
		Order("date desc, time asc").
		Find(&preRegistrations).Error
	return preRegistrations, err
}

func (r *PreRegistrationRepository) Create(preReg *models.PreRegistration) error {
	return database.DB.Create(preReg).Error
}

func (r *PreRegistrationRepository) Update(preReg *models.PreRegistration) error {
	return database.DB.Save(preReg).Error
}

func (r *PreRegistrationRepository) GetByCodeAndDate(code string, date string) (*models.PreRegistration, error) {
	var preReg models.PreRegistration
	err := database.DB.Where("code = ? AND date = ?", code, date).
		Preload("Service").
		First(&preReg).Error
	return &preReg, err
}

func (r *PreRegistrationRepository) GetByID(id string) (*models.PreRegistration, error) {
	var preReg models.PreRegistration
	err := database.DB.Where("id = ?", id).First(&preReg).Error
	return &preReg, err
}

func (r *PreRegistrationRepository) GetByTicketID(ticketID string) (*models.PreRegistration, error) {
	var preReg models.PreRegistration
	err := database.DB.Where("ticket_id = ?", ticketID).First(&preReg).Error
	return &preReg, err
}

func (r *PreRegistrationRepository) CountByServiceDateAndTime(serviceID, date, time string) (int64, error) {
	var count int64
	err := database.DB.Model(&models.PreRegistration{}).
		Where("service_id = ? AND date = ? AND time = ? AND status != 'canceled'", serviceID, date, time).
		Count(&count).Error
	return count, err
}
