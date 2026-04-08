package services

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Pre-registration validation errors returned to HTTP layer (kiosk validate / redeem).
var (
	ErrPreRegistrationNotFound = errors.New("pre-registration not found")
	ErrPreRegistrationConsumed = errors.New("pre-registration already used or canceled")
	ErrPreRegistrationTooEarly = errors.New("too early to redeem ticket")
	ErrPreRegistrationTooLate  = errors.New("too late to redeem ticket")
)

type PreRegistrationService struct {
	repo        *repository.PreRegistrationRepository
	slotRepo    *repository.SlotRepository
	ticketRepo  repository.TicketRepository  // Interface
	serviceRepo repository.ServiceRepository // Interface
}

func NewPreRegistrationService(
	repo *repository.PreRegistrationRepository,
	slotRepo *repository.SlotRepository,
	ticketRepo repository.TicketRepository,
	serviceRepo repository.ServiceRepository,
) *PreRegistrationService {
	return &PreRegistrationService{
		repo:        repo,
		slotRepo:    slotRepo,
		ticketRepo:  ticketRepo,
		serviceRepo: serviceRepo,
	}
}

func (s *PreRegistrationService) GetByUnitID(unitID string) ([]models.PreRegistration, error) {
	return s.repo.GetByUnitID(unitID)
}

func (s *PreRegistrationService) GetByID(id string) (*models.PreRegistration, error) {
	return s.repo.GetByID(id)
}

func (s *PreRegistrationService) Create(preReg *models.PreRegistration) error {
	// Generate unique 6-digit code
	code, err := s.generateUniqueCode(preReg.Date)
	if err != nil {
		return err
	}
	preReg.Code = code
	preReg.Status = "created"
	return s.repo.Create(preReg)
}

func (s *PreRegistrationService) Update(preReg *models.PreRegistration) error {
	return s.repo.Update(preReg)
}

func (s *PreRegistrationService) generateUniqueCode(date string) (string, error) {
	for i := 0; i < 10; i++ { // Try 10 times
		n, err := rand.Int(rand.Reader, big.NewInt(1000000))
		if err != nil {
			return "", err
		}
		code := fmt.Sprintf("%06d", n)

		// Check uniqueness for the date
		_, err = s.repo.GetByCodeAndDate(code, date)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return code, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", errors.New("failed to generate unique code")
}

func (s *PreRegistrationService) ValidateForKiosk(code string) (*models.PreRegistration, error) {
	today := time.Now().Format("2006-01-02")
	preReg, err := s.repo.GetByCodeAndDate(code, today)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPreRegistrationNotFound
		}
		return nil, err
	}

	if preReg.Status != "created" {
		return nil, ErrPreRegistrationConsumed
	}

	// Validate time window: -30m to +5m
	apptTime, err := time.Parse("15:04", preReg.Time)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	// Construct full appointment time
	apptFull := time.Date(now.Year(), now.Month(), now.Day(), apptTime.Hour(), apptTime.Minute(), 0, 0, now.Location())

	diff := now.Sub(apptFull)

	// If diff is negative, it means now is before appointment (early)
	// If diff is positive, it means now is after appointment (late)

	// Allow 30 mins early (diff > -30m) and 5 mins late (diff < 5m)
	// So: -30m <= diff <= 5m

	if diff < -30*time.Minute {
		return nil, ErrPreRegistrationTooEarly
	}
	if diff > 5*time.Minute {
		return nil, ErrPreRegistrationTooLate
	}

	return preReg, nil
}

func (s *PreRegistrationService) MarkAsRedeemed(preRegID, ticketID string) error {
	preReg, err := s.repo.GetByID(preRegID)
	if err != nil {
		return err
	}
	preReg.Status = "ticket_issued"
	preReg.TicketID = &ticketID
	return s.repo.Update(preReg)
}

// GetAvailableSlots calculates available slots for a given date
func (s *PreRegistrationService) GetAvailableSlots(unitID, serviceID, date string) ([]string, error) {
	// 1. Get Weekly Capacity for the day of week
	parsedDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, err
	}
	dayOfWeek := parsedDate.Weekday().String() // "Monday", etc.

	// Fetch capacities
	capacities, err := s.slotRepo.GetWeeklyCapacities(unitID)
	if err != nil {
		return nil, err
	}

	var availableSlots []string

	for _, cap := range capacities {
		// Check day (case insensitive)
		if cap.DayOfWeek != "" && cap.ServiceID == serviceID {
			if isSameDay(cap.DayOfWeek, dayOfWeek) {
				// Check current bookings count
				count, err := s.repo.CountByServiceDateAndTime(serviceID, date, cap.StartTime)
				if err != nil {
					continue
				}

				if int64(cap.Capacity) > count {
					availableSlots = append(availableSlots, cap.StartTime)
				}
			}
		}
	}

	return availableSlots, nil
}

func isSameDay(d1, d2 string) bool {
	// Case-insensitive comparison of day names
	// Both should be "Monday", "Tuesday", etc. from DB and Go's Weekday().String()
	return strings.EqualFold(d1, d2)
}
