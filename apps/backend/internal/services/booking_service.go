package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"time"

	"github.com/google/uuid"
)

type BookingService interface {
	CreateBooking(booking *models.Booking) error
	GetBookingsByUnit(unitID string) ([]models.Booking, error)
	GetBookingByID(id string) (*models.Booking, error)
	UpdateBooking(booking *models.Booking) error
	DeleteBooking(id string) error
}

type bookingService struct {
	repo repository.BookingRepository
}

func NewBookingService(repo repository.BookingRepository) BookingService {
	return &bookingService{repo: repo}
}

func (s *bookingService) CreateBooking(booking *models.Booking) error {
	if booking.UnitID == "" {
		return errors.New("unit ID is required")
	}
	if booking.ServiceID == "" {
		return errors.New("service ID is required")
	}
	if booking.Code == "" {
		booking.Code = uuid.New().String()[:8] // Simple code generation
	}
	if booking.Status == "" {
		booking.Status = "booked"
	}
	booking.CreatedAt = time.Now()
	return s.repo.Create(booking)
}

func (s *bookingService) GetBookingsByUnit(unitID string) ([]models.Booking, error) {
	return s.repo.FindAllByUnit(unitID)
}

func (s *bookingService) GetBookingByID(id string) (*models.Booking, error) {
	return s.repo.FindByID(id)
}

func (s *bookingService) UpdateBooking(booking *models.Booking) error {
	return s.repo.Update(booking)
}

func (s *bookingService) DeleteBooking(id string) error {
	return s.repo.Delete(id)
}
