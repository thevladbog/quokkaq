package repository

import (
	"errors"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNoNamedUnitClientUpdated is returned when UpdateNamesTx matches no non-anonymous unit_clients row.
var ErrNoNamedUnitClientUpdated = errors.New("no named unit client updated")

// UnitClientRepository persists per-unit visitor directory rows.
type UnitClientRepository interface {
	GetByID(id string) (*models.UnitClient, error)
	GetByIDTx(tx *gorm.DB, id string) (*models.UnitClient, error)
	GetAnonymousForUnitTx(tx *gorm.DB, unitID string) (*models.UnitClient, error)
	EnsureAnonymousForUnitTx(tx *gorm.DB, unitID string) (*models.UnitClient, error)
	FindByUnitAndPhoneE164Tx(tx *gorm.DB, unitID, phoneE164 string) (*models.UnitClient, error)
	CreateTx(tx *gorm.DB, c *models.UnitClient) error
	// UpdateNamesTx updates first_name and last_name for a non-anonymous unit client row.
	UpdateNamesTx(tx *gorm.DB, id, firstName, lastName string) error
	SearchNonAnonymous(unitID, query string, defaultRegion string, limit int) ([]models.UnitClient, error)
	// ListTagDefinitionIDsByClientTx returns assigned tag definition IDs for a unit client (order not guaranteed).
	ListTagDefinitionIDsByClientTx(tx *gorm.DB, unitClientID string) ([]string, error)
	// ReplaceClientTagAssignmentsTx replaces all tag assignments for the client (full set).
	ReplaceClientTagAssignmentsTx(tx *gorm.DB, unitID, unitClientID string, tagDefinitionIDs []string) error
}

type unitClientRepository struct {
	db *gorm.DB
}

func NewUnitClientRepository() UnitClientRepository {
	return &unitClientRepository{db: database.DB}
}

func (r *unitClientRepository) GetByID(id string) (*models.UnitClient, error) {
	return r.GetByIDTx(r.db, id)
}

func (r *unitClientRepository) GetByIDTx(tx *gorm.DB, id string) (*models.UnitClient, error) {
	if tx == nil {
		return nil, errors.New("nil tx in GetByIDTx")
	}
	var c models.UnitClient
	err := tx.First(&c, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *unitClientRepository) GetAnonymousForUnitTx(tx *gorm.DB, unitID string) (*models.UnitClient, error) {
	if tx == nil {
		return nil, errors.New("nil tx in GetAnonymousForUnitTx")
	}
	var c models.UnitClient
	err := tx.Where("unit_id = ? AND is_anonymous = ?", unitID, true).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *unitClientRepository) EnsureAnonymousForUnitTx(tx *gorm.DB, unitID string) (*models.UnitClient, error) {
	if tx == nil {
		return nil, errors.New("nil tx in EnsureAnonymousForUnitTx")
	}
	c, err := r.GetAnonymousForUnitTx(tx, unitID)
	if err == nil {
		return c, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := &models.UnitClient{
		UnitID:      unitID,
		FirstName:   "Аноним",
		LastName:    "",
		PhoneE164:   nil,
		IsAnonymous: true,
	}
	// Partial unique index idx_unit_clients_unit_anonymous_one is ON (unit_id) WHERE is_anonymous = true;
	// use ON CONFLICT ... DO NOTHING so a duplicate does not abort the transaction (PostgreSQL).
	res := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "unit_id"}},
		TargetWhere: clause.Where{
			Exprs: []clause.Expression{
				clause.Eq{Column: clause.Column{Name: "is_anonymous"}, Value: true},
			},
		},
		DoNothing: true,
	}).Create(row)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		var again models.UnitClient
		if err := r.db.Where("unit_id = ? AND is_anonymous = ?", unitID, true).First(&again).Error; err != nil {
			return nil, fmt.Errorf("fetch anonymous client after concurrent create: %w", err)
		}
		return &again, nil
	}
	return row, nil
}

func (r *unitClientRepository) FindByUnitAndPhoneE164Tx(tx *gorm.DB, unitID, phoneE164 string) (*models.UnitClient, error) {
	if tx == nil {
		return nil, errors.New("nil tx in FindByUnitAndPhoneE164Tx")
	}
	var c models.UnitClient
	err := tx.Where("unit_id = ? AND phone_e164 = ? AND is_anonymous = ?", unitID, phoneE164, false).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *unitClientRepository) CreateTx(tx *gorm.DB, c *models.UnitClient) error {
	if tx == nil {
		return errors.New("nil tx in CreateTx")
	}
	return tx.Create(c).Error
}

func (r *unitClientRepository) UpdateNamesTx(tx *gorm.DB, id, firstName, lastName string) error {
	if tx == nil {
		return errors.New("nil tx in UpdateNamesTx")
	}
	res := tx.Model(&models.UnitClient{}).Where("id = ? AND is_anonymous = ?", id, false).Updates(map[string]interface{}{
		"first_name": firstName,
		"last_name":  lastName,
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNoNamedUnitClientUpdated
	}
	return nil
}

func ilikePattern(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return "%" + s + "%"
}

func (r *unitClientRepository) SearchNonAnonymous(unitID, query string, defaultRegion string, limit int) ([]models.UnitClient, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	seen := make(map[string]struct{})
	var out []models.UnitClient

	if e164, ok := phoneutil.TryParse(q, defaultRegion); ok {
		var exact models.UnitClient
		err := r.db.Where("unit_id = ? AND phone_e164 = ? AND is_anonymous = ?", unitID, e164, false).First(&exact).Error
		if err == nil {
			out = append(out, exact)
			seen[exact.ID] = struct{}{}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	pat := ilikePattern(q)
	var fuzzy []models.UnitClient
	qb := r.db.Where("unit_id = ? AND is_anonymous = ?", unitID, false).
		Where("first_name ILIKE ? ESCAPE '\\' OR last_name ILIKE ? ESCAPE '\\' OR phone_e164 ILIKE ? ESCAPE '\\'", pat, pat, pat).
		Limit(limit)
	if err := qb.Find(&fuzzy).Error; err != nil {
		return nil, err
	}
	for _, c := range fuzzy {
		if _, ok := seen[c.ID]; ok {
			continue
		}
		out = append(out, c)
		seen[c.ID] = struct{}{}
		if len(out) >= limit {
			break
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (r *unitClientRepository) ListTagDefinitionIDsByClientTx(tx *gorm.DB, unitClientID string) ([]string, error) {
	if tx == nil {
		return nil, errors.New("nil tx in ListTagDefinitionIDsByClientTx")
	}
	var rows []models.UnitClientTagAssignment
	if err := tx.Where("unit_client_id = ?", unitClientID).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.TagDefinitionID)
	}
	return out, nil
}

func (r *unitClientRepository) ReplaceClientTagAssignmentsTx(tx *gorm.DB, unitID, unitClientID string, tagDefinitionIDs []string) error {
	if tx == nil {
		return errors.New("nil tx in ReplaceClientTagAssignmentsTx")
	}
	if err := tx.Where("unit_id = ? AND unit_client_id = ?", unitID, unitClientID).Delete(&models.UnitClientTagAssignment{}).Error; err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(tagDefinitionIDs))
	uniqueTagIDs := make([]string, 0, len(tagDefinitionIDs))
	for _, tid := range tagDefinitionIDs {
		if _, dup := seen[tid]; dup {
			continue
		}
		seen[tid] = struct{}{}
		uniqueTagIDs = append(uniqueTagIDs, tid)
	}
	if len(uniqueTagIDs) == 0 {
		return nil
	}
	rows := make([]models.UnitClientTagAssignment, 0, len(uniqueTagIDs))
	for _, tid := range uniqueTagIDs {
		rows = append(rows, models.UnitClientTagAssignment{
			UnitID:          unitID,
			UnitClientID:    unitClientID,
			TagDefinitionID: tid,
		})
	}
	return tx.Create(&rows).Error
}
