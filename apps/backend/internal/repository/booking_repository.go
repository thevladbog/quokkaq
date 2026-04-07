package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type BookingRepository interface {
	Create(booking *models.Booking) error
	FindAllByUnit(unitID string) ([]models.Booking, error)
	FindByID(id string) (*models.Booking, error)
	Update(booking *models.Booking) error
	Delete(id string) error
}

type bookingRepository struct {
	db *gorm.DB
}

func NewBookingRepository() BookingRepository {
	return &bookingRepository{db: database.DB}
}

func (r *bookingRepository) Create(booking *models.Booking) error {
	return r.db.Create(booking).Error
}

func (r *bookingRepository) FindAllByUnit(unitID string) ([]models.Booking, error) {
	var bookings []models.Booking
	err := r.db.Where("unit_id = ?", unitID).Find(&bookings).Error
	return bookings, err
}

func (r *bookingRepository) FindByID(id string) (*models.Booking, error) {
	var booking models.Booking
	err := r.db.First(&booking, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &booking, nil
}

func (r *bookingRepository) Update(booking *models.Booking) error {
	return r.db.Save(booking).Error
}

func (r *bookingRepository) Delete(id string) error {
	return r.db.Delete(&models.Booking{}, "id = ?", id).Error
}
