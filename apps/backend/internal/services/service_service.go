package services

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// ErrServiceUnitImmutable is returned when an update tries to change a service's unit.
var ErrServiceUnitImmutable = errors.New("service unit cannot be reassigned")

// ErrDuplicateCalendarSlotKey is returned when another service in the same unit already uses this calendar slot key.
var ErrDuplicateCalendarSlotKey = errors.New("calendar slot key already in use for this unit")

// ErrServiceQuotaExceeded is returned when the company's plan does not allow creating another service.
var ErrServiceQuotaExceeded = errors.New("service quota exceeded for current subscription plan")

type ServiceService interface {
	CreateService(service *models.Service) error
	GetServicesByUnit(unitID string) ([]models.Service, error)
	GetServiceByID(id string) (*models.Service, error)
	UpdateService(service *models.Service) error
	DeleteService(id string) error
}

type serviceService struct {
	repo     repository.ServiceRepository
	unitRepo repository.UnitRepository
	quota    QuotaService
}

func NewServiceService(repo repository.ServiceRepository, unitRepo repository.UnitRepository) ServiceService {
	return &serviceService{repo: repo, unitRepo: unitRepo}
}

// NewServiceServiceWithQuota creates a ServiceService with quota enforcement enabled.
func NewServiceServiceWithQuota(repo repository.ServiceRepository, unitRepo repository.UnitRepository, quota QuotaService) ServiceService {
	return &serviceService{repo: repo, unitRepo: unitRepo, quota: quota}
}

func normalizeCalendarSlotKeyPtr(p *string) *string {
	if p == nil {
		return nil
	}
	t := strings.TrimSpace(*p)
	if t == "" {
		return nil
	}
	return &t
}

func effectiveCalendarSlotKeyForUpdate(incoming *models.Service, existing *models.Service) *string {
	if incoming.CalendarSlotKey != nil {
		return normalizeCalendarSlotKeyPtr(incoming.CalendarSlotKey)
	}
	return existing.CalendarSlotKey
}

func (s *serviceService) assertCalendarSlotKeyUnique(unitID string, key *string, excludeServiceID string) error {
	if key == nil || *key == "" {
		return nil
	}
	n, err := s.repo.CountByUnitAndCalendarSlotKey(unitID, *key, excludeServiceID)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrDuplicateCalendarSlotKey
	}
	return nil
}

func (s *serviceService) CreateService(service *models.Service) error {
	if service.UnitID == "" {
		return errors.New("unit ID is required")
	}
	service.CalendarSlotKey = normalizeCalendarSlotKeyPtr(service.CalendarSlotKey)
	if err := s.assertCalendarSlotKeyUnique(service.UnitID, service.CalendarSlotKey, ""); err != nil {
		return err
	}
	if err := ValidateOptionalChildServiceZone(s.unitRepo, service.UnitID, &service.RestrictedServiceZoneID); err != nil {
		return err
	}
	if s.quota != nil {
		unit, err := s.unitRepo.FindByIDLight(service.UnitID)
		if err != nil {
			return err
		}
		ok, err := s.quota.CheckQuota(unit.CompanyID, "services")
		if err != nil {
			return err
		}
		if !ok {
			return ErrServiceQuotaExceeded
		}
	}
	if err := s.repo.Create(service); err != nil {
		if errors.Is(err, repository.ErrDuplicateCalendarSlotKey) {
			return ErrDuplicateCalendarSlotKey
		}
		return err
	}
	return nil
}

func (s *serviceService) GetServicesByUnit(unitID string) ([]models.Service, error) {
	return s.repo.FindAllByUnit(unitID)
}

func (s *serviceService) GetServiceByID(id string) (*models.Service, error) {
	return s.repo.FindByID(id)
}

func (s *serviceService) UpdateService(service *models.Service) error {
	existing, err := s.repo.FindByID(service.ID)
	if err != nil {
		return err
	}
	if service.UnitID != "" && service.UnitID != existing.UnitID {
		return ErrServiceUnitImmutable
	}
	// Never persist a caller-supplied unit change; keep the row's unit.
	service.UnitID = existing.UnitID

	key := effectiveCalendarSlotKeyForUpdate(service, existing)
	if err := s.assertCalendarSlotKeyUnique(service.UnitID, key, service.ID); err != nil {
		return err
	}
	if service.CalendarSlotKey != nil {
		service.CalendarSlotKey = normalizeCalendarSlotKeyPtr(service.CalendarSlotKey)
	}

	if err := ValidateOptionalChildServiceZone(s.unitRepo, service.UnitID, &service.RestrictedServiceZoneID); err != nil {
		return err
	}
	if err := s.repo.Update(service); err != nil {
		if errors.Is(err, repository.ErrDuplicateCalendarSlotKey) {
			return ErrDuplicateCalendarSlotKey
		}
		return err
	}
	return nil
}

func (s *serviceService) DeleteService(id string) error {
	return s.repo.Delete(id)
}
