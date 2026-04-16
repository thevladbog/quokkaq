package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// ErrDuplicateCalendarSlotKey is returned when a concurrent create/update hits the partial unique index on (unit_id, calendar_slot_key).
var ErrDuplicateCalendarSlotKey = errors.New("calendar slot key already in use for this unit")

func isCalendarSlotKeyUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	if !errors.As(err, &pe) || pe.Code != "23505" {
		return false
	}
	cn := strings.ToLower(pe.ConstraintName)
	return strings.Contains(cn, "calendar_slot_key") || cn == "idx_services_unit_calendar_slot_key_uq"
}

type ServiceRepository interface {
	Create(service *models.Service) error
	FindAllByUnit(unitID string) ([]models.Service, error)
	// FindAllByUnitSubtree returns services for rootUnitID and all descendant units (single recursive CTE).
	FindAllByUnitSubtree(rootUnitID string) ([]models.Service, error)
	FindByID(id string) (*models.Service, error)
	FindByIDTx(tx *gorm.DB, id string) (*models.Service, error)
	// FindMapByIDs returns services keyed by id; missing rows are omitted.
	FindMapByIDs(ids []string) (map[string]*models.Service, error)
	// CountByUnitAndIDs returns how many of the given service IDs belong to the unit (distinct rows).
	CountByUnitAndIDs(unitID string, ids []string) (int64, error)
	// CountByUnitAndCalendarSlotKey counts services with the same non-empty calendar_slot_key in the unit, optionally excluding one id.
	CountByUnitAndCalendarSlotKey(unitID, calendarSlotKey string, excludeServiceID string) (int64, error)
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
	err := r.db.Create(service).Error
	if err != nil && isCalendarSlotKeyUniqueViolation(err) {
		return ErrDuplicateCalendarSlotKey
	}
	return err
}

func (r *serviceRepository) FindAllByUnit(unitID string) ([]models.Service, error) {
	var services []models.Service
	err := r.db.Where("unit_id = ?", unitID).Find(&services).Error
	return services, err
}

func (r *serviceRepository) FindAllByUnitSubtree(rootUnitID string) ([]models.Service, error) {
	rootUnitID = strings.TrimSpace(rootUnitID)
	if rootUnitID == "" {
		return nil, nil
	}
	var services []models.Service
	// Anchor includes rootUnitID so behavior matches the prior BFS (root counted even if missing from units).
	// PostgreSQL and SQLite both support this recursive CTE shape.
	const q = `
WITH RECURSIVE subtree AS (
	SELECT ? AS id
	UNION ALL
	SELECT u.id FROM units u
	INNER JOIN subtree s ON u.parent_id = s.id
)
SELECT services.* FROM services
WHERE services.unit_id IN (SELECT id FROM subtree)`
	err := r.db.Raw(q, rootUnitID).Scan(&services).Error
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

func (r *serviceRepository) CountByUnitAndCalendarSlotKey(unitID, calendarSlotKey string, excludeServiceID string) (int64, error) {
	if unitID == "" || calendarSlotKey == "" {
		return 0, nil
	}
	q := r.db.Model(&models.Service{}).
		Where("unit_id = ? AND calendar_slot_key = ?", unitID, calendarSlotKey)
	if excludeServiceID != "" {
		q = q.Where("id <> ?", excludeServiceID)
	}
	var n int64
	err := q.Count(&n).Error
	return n, err
}

func (r *serviceRepository) Update(service *models.Service) error {
	// Use Updates to update only the provided fields without touching associations
	err := r.db.Model(&models.Service{}).Where("id = ?", service.ID).Updates(service).Error
	if err != nil && isCalendarSlotKeyUniqueViolation(err) {
		return ErrDuplicateCalendarSlotKey
	}
	return err
}

func (r *serviceRepository) Delete(id string) error {
	return r.db.Delete(&models.Service{}, "id = ?", id).Error
}
