package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// ErrServiceUnitImmutable is returned when an update tries to change a service's unit.
var ErrServiceUnitImmutable = errors.New("service unit cannot be reassigned")

type ServiceService interface {
	CreateService(service *models.Service) error
	GetServicesByUnit(unitID string) ([]models.Service, error)
	GetServiceByID(id string) (*models.Service, error)
	UpdateService(service *models.Service) error
	DeleteService(id string) error
}

type serviceService struct {
	repo repository.ServiceRepository
}

func NewServiceService(repo repository.ServiceRepository) ServiceService {
	return &serviceService{repo: repo}
}

func (s *serviceService) CreateService(service *models.Service) error {
	if service.UnitID == "" {
		return errors.New("unit ID is required")
	}
	return s.repo.Create(service)
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
	return s.repo.Update(service)
}

func (s *serviceService) DeleteService(id string) error {
	return s.repo.Delete(id)
}
