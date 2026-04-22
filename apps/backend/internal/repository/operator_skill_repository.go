package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OperatorSkillRepository interface {
	ListByUnit(unitID string) ([]models.OperatorSkill, error)
	ListByUnitAndUser(unitID, userID string) ([]models.OperatorSkill, error)
	// ListByUnitAndService returns all operator-skill mappings for a specific service within a unit.
	ListByUnitAndService(unitID, serviceID string) ([]models.OperatorSkill, error)
	UpsertBulk(skills []models.OperatorSkill) error
	DeleteByID(unitID, skillID string) error
	// ListSkillServiceIDsForOperator returns service IDs ordered by skill priority (ascending) for a given operator.
	ListSkillServiceIDsForOperator(unitID, userID string) ([]string, error)
}

type operatorSkillRepository struct {
	db *gorm.DB
}

func NewOperatorSkillRepository() OperatorSkillRepository {
	return &operatorSkillRepository{db: database.DB}
}

func (r *operatorSkillRepository) ListByUnit(unitID string) ([]models.OperatorSkill, error) {
	var skills []models.OperatorSkill
	err := r.db.
		Where("unit_id::text = ?", unitID).
		Order("user_id ASC, priority ASC, service_id ASC").
		Find(&skills).Error
	return skills, err
}

func (r *operatorSkillRepository) ListByUnitAndUser(unitID, userID string) ([]models.OperatorSkill, error) {
	var skills []models.OperatorSkill
	err := r.db.
		Where("unit_id::text = ? AND user_id::text = ?", unitID, userID).
		Order("priority ASC, service_id ASC").
		Find(&skills).Error
	return skills, err
}

func (r *operatorSkillRepository) ListByUnitAndService(unitID, serviceID string) ([]models.OperatorSkill, error) {
	var skills []models.OperatorSkill
	err := r.db.
		Where("unit_id::text = ? AND service_id::text = ?", unitID, serviceID).
		Order("user_id ASC, priority ASC").
		Find(&skills).Error
	return skills, err
}

// UpsertBulk inserts or updates skills (ON CONFLICT on uniq_op_skill updates priority).
func (r *operatorSkillRepository) UpsertBulk(skills []models.OperatorSkill) error {
	if len(skills) == 0 {
		return nil
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "unit_id"}, {Name: "user_id"}, {Name: "service_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"priority"}),
	}).Create(&skills).Error
}

func (r *operatorSkillRepository) DeleteByID(unitID, skillID string) error {
	return r.db.
		Where("id::text = ? AND unit_id::text = ?", skillID, unitID).
		Delete(&models.OperatorSkill{}).Error
}

func (r *operatorSkillRepository) ListSkillServiceIDsForOperator(unitID, userID string) ([]string, error) {
	type row struct {
		ServiceID string `gorm:"column:service_id"`
	}
	var rows []row
	err := r.db.Raw(`
SELECT service_id::text AS service_id
FROM operator_skills
WHERE unit_id::text = ? AND user_id::text = ?
ORDER BY priority ASC, service_id ASC
`, unitID, userID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.ServiceID)
	}
	return out, nil
}
