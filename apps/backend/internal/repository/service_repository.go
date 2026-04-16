package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type ServiceRepository interface {
	Create(service *models.Service) error
	FindAllByUnit(unitID string) ([]models.Service, error)
	// FindAllByUnitSubtree returns services for rootUnitID and all descendant units (BFS tree).
	FindAllByUnitSubtree(rootUnitID string) ([]models.Service, error)
	FindByID(id string) (*models.Service, error)
	FindByIDTx(tx *gorm.DB, id string) (*models.Service, error)
	// FindMapByIDs returns services keyed by id; missing rows are omitted.
	FindMapByIDs(ids []string) (map[string]*models.Service, error)
	// CountByUnitAndIDs returns how many of the given service IDs belong to the unit (distinct rows).
	CountByUnitAndIDs(unitID string, ids []string) (int64, error)
	Update(service *models.Service) error
	Delete(id string) error
}

type serviceRepository struct {
	db *gorm.DB
}

func NewServiceRepository() ServiceRepository {
	return &serviceRepository{db: database.DB}
}

func (r *serviceRepository) Create(service *models.Service) error {
	return r.db.Create(service).Error
}

func (r *serviceRepository) FindAllByUnit(unitID string) ([]models.Service, error) {
	var services []models.Service
	err := r.db.Where("unit_id = ?", unitID).Find(&services).Error
	return services, err
}

func (r *serviceRepository) collectUnitIDsInSubtree(root string) ([]string, error) {
	var ids []string
	queue := []string{root}
	seen := make(map[string]bool)
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
		var children []models.Unit
		err := r.db.Select("id").Where("parent_id = ?", id).Find(&children).Error
		if err != nil {
			return nil, err
		}
		for i := range children {
			queue = append(queue, children[i].ID)
		}
	}
	return ids, nil
}

func (r *serviceRepository) FindAllByUnitSubtree(rootUnitID string) ([]models.Service, error) {
	ids, err := r.collectUnitIDsInSubtree(rootUnitID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	var services []models.Service
	err = r.db.Where("unit_id IN ?", ids).Find(&services).Error
	return services, err
}

func (r *serviceRepository) FindByID(id string) (*models.Service, error) {
	return r.FindByIDTx(r.db, id)
}

func (r *serviceRepository) FindByIDTx(tx *gorm.DB, id string) (*models.Service, error) {
	if tx == nil {
		return nil, errors.New("nil tx provided to FindByIDTx")
	}
	var service models.Service
	err := tx.First(&service, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &service, nil
}

func (r *serviceRepository) FindMapByIDs(ids []string) (map[string]*models.Service, error) {
	out := make(map[string]*models.Service)
	if len(ids) == 0 {
		return out, nil
	}
	uniq := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return out, nil
	}
	var list []models.Service
	if err := r.db.Where("id IN ?", uniq).Find(&list).Error; err != nil {
		return nil, err
	}
	for i := range list {
		s := list[i]
		cp := s
		out[s.ID] = &cp
	}
	return out, nil
}

func (r *serviceRepository) CountByUnitAndIDs(unitID string, ids []string) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	var n int64
	err := r.db.Model(&models.Service{}).
		Where("unit_id = ? AND id IN ?", unitID, ids).
		Count(&n).Error
	return n, err
}

func (r *serviceRepository) Update(service *models.Service) error {
	// Use Updates to update only the provided fields without touching associations
	return r.db.Model(&models.Service{}).Where("id = ?", service.ID).Updates(service).Error
}

func (r *serviceRepository) Delete(id string) error {
	return r.db.Delete(&models.Service{}, "id = ?", id).Error
}
