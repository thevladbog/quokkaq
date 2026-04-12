package services

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// UnitClientService is the visitor directory for a unit (search, anonymous bootstrap).
type UnitClientService interface {
	EnsureAnonymousClient(unitID string) error
	EnsureAnonymousClientTx(tx *gorm.DB, unitID string) error
	SearchForUnit(unitID, query string) ([]models.UnitClient, error)
	GetByIDInUnit(unitID, clientID string) (*models.UnitClient, error)
}

type unitClientService struct {
	repo repository.UnitClientRepository
	db   *gorm.DB
}

func NewUnitClientService(repo repository.UnitClientRepository, db *gorm.DB) UnitClientService {
	return &unitClientService{repo: repo, db: db}
}

func (s *unitClientService) EnsureAnonymousClient(unitID string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		return s.EnsureAnonymousClientTx(tx, unitID)
	})
}

func (s *unitClientService) EnsureAnonymousClientTx(tx *gorm.DB, unitID string) error {
	_, err := s.repo.EnsureAnonymousForUnitTx(tx, unitID)
	return err
}

func (s *unitClientService) SearchForUnit(unitID, query string) ([]models.UnitClient, error) {
	return s.repo.SearchNonAnonymous(unitID, query, phoneutil.DefaultRegion(), 20)
}

func (s *unitClientService) GetByIDInUnit(unitID, clientID string) (*models.UnitClient, error) {
	c, err := s.repo.GetByID(clientID)
	if err != nil {
		return nil, err
	}
	if c.UnitID != unitID {
		return nil, gorm.ErrRecordNotFound
	}
	return c, nil
}
