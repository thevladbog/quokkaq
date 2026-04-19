package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Pre-registration validation errors returned to HTTP layer (kiosk validate / redeem).
var (
	ErrPreRegistrationNotFound                      = errors.New("pre-registration not found")
	ErrPreRegistrationConsumed                      = errors.New("pre-registration already used or canceled")
	ErrPreRegistrationTooEarly                      = errors.New("too early to redeem ticket")
	ErrPreRegistrationTooLate                       = errors.New("too late to redeem ticket")
	ErrPreRegistrationCannotCancel                  = errors.New("pre-registration cannot be canceled in current status")
	ErrPreRegistrationCanceledImmutable             = errors.New("canceled pre-registration cannot be updated")
	ErrPreRegistrationScheduleImmutableWhenConsumed = errors.New("service, date, and time cannot be changed after the pre-registration is completed or a ticket was issued")
	// ErrPreRegistrationCancelPersistAfterCalendarRelease is returned when ReleaseFreeSlot succeeded but persisting the canceled row failed.
	// The calendar may already show the slot as free while the DB still references the old external event — ops should reconcile.
	ErrPreRegistrationCancelPersistAfterCalendarRelease = errors.New("pre-registration cancel could not be persisted after the calendar slot was released")
)

// preRegCalendarSync abstracts CalDAV operations for pre-registration cancel/reschedule.
// Implemented by *CalendarIntegrationService.
type preRegCalendarSync interface {
	ResolveIntegrationForPreReg(unitID, optionalIntegrationID string) (*models.UnitCalendarIntegration, error)
	ResolveIntegrationForRelease(pr *models.PreRegistration) (*models.UnitCalendarIntegration, error)
	HasEnabledCalendarIntegration(unitID string) (bool, error)
	ReleaseFreeSlot(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string) error
	ValidateAndApplyBooked(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string, pr *models.PreRegistration) (newETag string, err error)
	ListCalendarSlots(unitID, serviceID, date string) ([]models.PreRegCalendarSlotItem, error)
}

type PreRegistrationService struct {
	repo        *repository.PreRegistrationRepository
	slotRepo    *repository.SlotRepository
	ticketRepo  repository.TicketRepository // Interface
	serviceRepo repository.ServiceRepository
	calendar    preRegCalendarSync
}

var _ preRegCalendarSync = (*CalendarIntegrationService)(nil)

func NewPreRegistrationService(
	repo *repository.PreRegistrationRepository,
	slotRepo *repository.SlotRepository,
	ticketRepo repository.TicketRepository,
	serviceRepo repository.ServiceRepository,
	calendar preRegCalendarSync,
) *PreRegistrationService {
	return &PreRegistrationService{
		repo:        repo,
		slotRepo:    slotRepo,
		ticketRepo:  ticketRepo,
		serviceRepo: serviceRepo,
		calendar:    calendar,
	}
}

func (s *PreRegistrationService) GetByUnitID(unitID string) ([]models.PreRegistration, error) {
	return s.repo.GetByUnitID(unitID)
}

func (s *PreRegistrationService) GetByID(id string) (*models.PreRegistration, error) {
	return s.repo.GetByID(id)
}

// Create persists a pre-registration. When calendar integration applies, CalDAV eligibility and booking
// (ValidateAndApplyBooked: GET, slot must be Free, ETag must match when supplied, then PUT to booked)
// run before any INSERT — same helper chain as reschedule. If the INSERT fails after a successful PUT,
// the calendar slot is released via ReleaseFreeSlot (no row is left without a matching undo path).
func (s *PreRegistrationService) Create(ctx context.Context, preReg *models.PreRegistration, externalHref, externalETag, calendarIntegrationID string) error {
	code, err := s.generateUniqueCode(preReg.Date)
	if err != nil {
		return err
	}
	preReg.ID = uuid.New().String()
	preReg.Code = code
	preReg.Status = "created"

	if s.calendar != nil {
		hasCal, herr := s.calendar.HasEnabledCalendarIntegration(preReg.UnitID)
		if herr != nil {
			return herr
		}
		if hasCal {
			integ, ierr := s.calendar.ResolveIntegrationForPreReg(preReg.UnitID, calendarIntegrationID)
			if ierr != nil {
				return ierr
			}
			if integ != nil && integ.Enabled {
				if strings.TrimSpace(externalHref) == "" {
					return fmt.Errorf("externalEventHref is required when calendar integration is enabled")
				}
				svc, err := s.serviceRepo.FindByID(preReg.ServiceID)
				if err != nil {
					return err
				}
				newETag, err := s.calendar.ValidateAndApplyBooked(ctx, integ, svc, externalHref, externalETag, preReg)
				if err != nil {
					return err
				}
				h := externalHref
				preReg.ExternalEventHref = &h
				preReg.ExternalEventETag = &newETag
				iid := integ.ID
				preReg.CalendarIntegrationID = &iid
				if err := s.repo.Create(preReg); err != nil {
					relErr := s.calendar.ReleaseFreeSlot(ctx, integ, svc, externalHref, newETag)
					return errors.Join(err, relErr)
				}
				return nil
			}
		}
	}

	return s.repo.Create(preReg)
}

// Update persists changes and syncs Yandex CalDAV on cancel or reschedule when integration is enabled.
func (s *PreRegistrationService) Update(ctx context.Context, previous *models.PreRegistration, next *models.PreRegistration, req *models.PreRegistrationUpdateRequest) error {
	if previous.Status == "canceled" {
		return ErrPreRegistrationCanceledImmutable
	}

	if next.Status == "canceled" {
		if previous.Status != "created" {
			return ErrPreRegistrationCannotCancel
		}
		next.Status = "canceled"
		calendarReleased := false
		if s.calendar != nil && previous.ExternalEventHref != nil && strings.TrimSpace(*previous.ExternalEventHref) != "" {
			integ, err := s.calendar.ResolveIntegrationForRelease(previous)
			if err != nil {
				return err
			}
			if integ != nil && integ.Enabled {
				svc, err := s.serviceRepo.FindByID(previous.ServiceID)
				if err != nil {
					return err
				}
				etag := ""
				if previous.ExternalEventETag != nil {
					etag = *previous.ExternalEventETag
				}
				if err := s.calendar.ReleaseFreeSlot(ctx, integ, svc, *previous.ExternalEventHref, etag); err != nil {
					return err
				}
				calendarReleased = true
			}
		}
		next.ExternalEventHref = nil
		next.ExternalEventETag = nil
		next.CalendarIntegrationID = nil
		if err := s.repo.Update(next); err != nil {
			if calendarReleased {
				href := ""
				if previous.ExternalEventHref != nil {
					href = *previous.ExternalEventHref
				}
				logger.PrintfCtx(ctx, "pre-registration cancel: database update failed after CalDAV ReleaseFreeSlot (reconcile DB vs calendar): preRegID=%s unitID=%s externalEventHref=%s err=%v",
					previous.ID, previous.UnitID, href, err)
				return fmt.Errorf("%w: %w", ErrPreRegistrationCancelPersistAfterCalendarRelease, err)
			}
			return err
		}
		return nil
	}

	if (previous.Status == "ticket_issued" || previous.Status == "completed") &&
		(previous.ServiceID != next.ServiceID || previous.Date != next.Date || previous.Time != next.Time) {
		return ErrPreRegistrationScheduleImmutableWhenConsumed
	}

	slotChanged := previous.Date != next.Date || previous.Time != next.Time || previous.ServiceID != next.ServiceID
	if slotChanged && previous.Status == "created" &&
		previous.ExternalEventHref != nil && strings.TrimSpace(*previous.ExternalEventHref) != "" && s.calendar != nil {

		newHref := ""
		newETag := ""
		newIntegID := ""
		if req != nil {
			newHref = strings.TrimSpace(req.ExternalEventHref)
			newETag = strings.TrimSpace(req.ExternalEventEtag)
			newIntegID = strings.TrimSpace(req.CalendarIntegrationID)
		}

		if newHref != "" {
			newSvc, err := s.serviceRepo.FindByID(next.ServiceID)
			if err != nil {
				return err
			}
			integNew, err := s.calendar.ResolveIntegrationForPreReg(next.UnitID, newIntegID)
			if err != nil {
				return err
			}
			if integNew == nil || !integNew.Enabled {
				return fmt.Errorf("calendar integration is not available for reschedule")
			}
			bookedETag, err := s.calendar.ValidateAndApplyBooked(ctx, integNew, newSvc, newHref, newETag, next)
			if err != nil {
				return err
			}

			hrefCopy := newHref
			next.ExternalEventHref = &hrefCopy
			next.ExternalEventETag = &bookedETag
			iid := integNew.ID
			next.CalendarIntegrationID = &iid

			if err := s.repo.Update(next); err != nil {
				relErr := s.calendar.ReleaseFreeSlot(ctx, integNew, newSvc, newHref, bookedETag)
				return errors.Join(err, relErr)
			}

			integOld, err := s.calendar.ResolveIntegrationForRelease(previous)
			if err != nil {
				logger.PrintfCtx(ctx, "pre-registration reschedule: resolve old integration for release: %v", err)
				return nil
			}
			if integOld != nil && integOld.Enabled {
				oldSvc, err := s.serviceRepo.FindByID(previous.ServiceID)
				if err != nil {
					logger.PrintfCtx(ctx, "pre-registration reschedule: load old service for calendar release: %v", err)
					return nil
				}
				oldEtag := ""
				if previous.ExternalEventETag != nil {
					oldEtag = *previous.ExternalEventETag
				}
				if err := s.calendar.ReleaseFreeSlot(ctx, integOld, oldSvc, *previous.ExternalEventHref, oldEtag); err != nil {
					logger.PrintfCtx(ctx, "pre-registration reschedule: release old calendar slot failed (retry/async cleanup recommended): href=%s err=%v", *previous.ExternalEventHref, err)
				}
			}
			return nil
		}

		next.ExternalEventHref = nil
		next.ExternalEventETag = nil
		next.CalendarIntegrationID = nil
		if err := s.repo.Update(next); err != nil {
			return err
		}
		integOld, err := s.calendar.ResolveIntegrationForRelease(previous)
		if err != nil {
			logger.PrintfCtx(ctx, "pre-registration reschedule (no new href): resolve old integration: %v", err)
			return nil
		}
		if integOld != nil && integOld.Enabled {
			oldSvc, err := s.serviceRepo.FindByID(previous.ServiceID)
			if err != nil {
				logger.PrintfCtx(ctx, "pre-registration reschedule (no new href): load old service: %v", err)
				return nil
			}
			oldEtag := ""
			if previous.ExternalEventETag != nil {
				oldEtag = *previous.ExternalEventETag
			}
			if err := s.calendar.ReleaseFreeSlot(ctx, integOld, oldSvc, *previous.ExternalEventHref, oldEtag); err != nil {
				logger.PrintfCtx(ctx, "pre-registration reschedule (no new href): release old calendar slot failed (retry/async cleanup recommended): href=%s err=%v", *previous.ExternalEventHref, err)
			}
		}
		return nil
	}

	return s.repo.Update(next)
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

// ListCalendarSlotItems returns CalDAV-backed slots when integration is enabled (otherwise nil, nil).
func (s *PreRegistrationService) ListCalendarSlotItems(unitID, serviceID, date string) ([]models.PreRegCalendarSlotItem, error) {
	if s.calendar == nil {
		return nil, nil
	}
	has, err := s.calendar.HasEnabledCalendarIntegration(unitID)
	if err != nil || !has {
		return nil, nil
	}
	return s.calendar.ListCalendarSlots(unitID, serviceID, date)
}

// GetAvailableSlots calculates available slots for a given date
func (s *PreRegistrationService) GetAvailableSlots(unitID, serviceID, date string) ([]string, error) {
	if s.calendar != nil {
		has, err := s.calendar.HasEnabledCalendarIntegration(unitID)
		if err != nil {
			return nil, err
		}
		if has {
			items, err := s.calendar.ListCalendarSlots(unitID, serviceID, date)
			if err != nil {
				return nil, err
			}
			seen := make(map[string]struct{})
			var out []string
			for _, it := range items {
				if _, ok := seen[it.Time]; ok {
					continue
				}
				seen[it.Time] = struct{}{}
				out = append(out, it.Time)
			}
			sort.Strings(out)
			return out, nil
		}
	}

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
