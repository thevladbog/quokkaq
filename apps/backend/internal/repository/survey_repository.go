package repository

import (
	"context"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SurveyRepository interface {
	CreateDefinition(ctx context.Context, d *models.SurveyDefinition) error
	UpdateDefinition(ctx context.Context, d *models.SurveyDefinition) error
	FindDefinitionByID(ctx context.Context, id string) (*models.SurveyDefinition, error)
	ListDefinitionsByScopeUnit(ctx context.Context, scopeUnitID string) ([]models.SurveyDefinition, error)
	FindActiveDefinitionByScopeUnit(ctx context.Context, scopeUnitID string) (*models.SurveyDefinition, error)
	SetActiveDefinition(ctx context.Context, scopeUnitID, surveyID string) error
	// CountDefinitionsReferencingIdleMediaFile counts survey definitions in company whose idle_screen JSON references fileName (substring match).
	CountDefinitionsReferencingIdleMediaFile(ctx context.Context, companyID, fileName string) (int64, error)

	UpsertResponse(ctx context.Context, r *models.SurveyResponse) error
	ResponseExistsForTicketAndSurvey(ctx context.Context, ticketID, surveyDefinitionID string) (bool, error)
	ListResponsesByUnit(ctx context.Context, unitID string, limit, offset int) ([]models.SurveyResponse, error)
	ListResponsesByClient(ctx context.Context, unitID, clientID string) ([]models.SurveyResponse, error)
}

type surveyRepository struct {
	db *gorm.DB
}

func NewSurveyRepository() SurveyRepository {
	return &surveyRepository{db: database.DB}
}

func (r *surveyRepository) CreateDefinition(ctx context.Context, d *models.SurveyDefinition) error {
	return r.db.WithContext(ctx).Create(d).Error
}

func (r *surveyRepository) UpdateDefinition(ctx context.Context, d *models.SurveyDefinition) error {
	return r.db.WithContext(ctx).Save(d).Error
}

func (r *surveyRepository) FindDefinitionByID(ctx context.Context, id string) (*models.SurveyDefinition, error) {
	var d models.SurveyDefinition
	err := r.db.WithContext(ctx).First(&d, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *surveyRepository) ListDefinitionsByScopeUnit(ctx context.Context, scopeUnitID string) ([]models.SurveyDefinition, error) {
	var rows []models.SurveyDefinition
	err := r.db.WithContext(ctx).Where("scope_unit_id = ?", scopeUnitID).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *surveyRepository) FindActiveDefinitionByScopeUnit(ctx context.Context, scopeUnitID string) (*models.SurveyDefinition, error) {
	var d models.SurveyDefinition
	err := r.db.WithContext(ctx).Where("scope_unit_id = ? AND is_active = ?", scopeUnitID, true).First(&d).Error
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *surveyRepository) SetActiveDefinition(ctx context.Context, scopeUnitID, surveyID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var verify models.SurveyDefinition
		if err := tx.Where("id = ? AND scope_unit_id = ?", surveyID, scopeUnitID).First(&verify).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.SurveyDefinition{}).
			Where("scope_unit_id = ?", scopeUnitID).
			Update("is_active", false).Error; err != nil {
			return err
		}
		res := tx.Model(&models.SurveyDefinition{}).
			Where("id = ? AND scope_unit_id = ?", surveyID, scopeUnitID).
			Update("is_active", true)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (r *surveyRepository) CountDefinitionsReferencingIdleMediaFile(ctx context.Context, companyID, fileName string) (int64, error) {
	fn := strings.TrimSpace(fileName)
	if fn == "" {
		return 0, nil
	}
	pattern := "%" + fn + "%"
	var count int64
	err := r.db.WithContext(ctx).Model(&models.SurveyDefinition{}).
		Where("company_id = ? AND idle_screen::text LIKE ?", companyID, pattern).
		Count(&count).Error
	return count, err
}

func (r *surveyRepository) UpsertResponse(ctx context.Context, row *models.SurveyResponse) error {
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "ticket_id"}, {Name: "survey_definition_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"counter_id", "unit_id", "client_id", "answers", "submitted_at",
		}),
	}).Create(row).Error
}

func (r *surveyRepository) ResponseExistsForTicketAndSurvey(ctx context.Context, ticketID, surveyDefinitionID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.SurveyResponse{}).
		Where("ticket_id = ? AND survey_definition_id = ?", ticketID, surveyDefinitionID).
		Count(&count).Error
	return count > 0, err
}

func (r *surveyRepository) ListResponsesByUnit(ctx context.Context, unitID string, limit, offset int) ([]models.SurveyResponse, error) {
	var rows []models.SurveyResponse
	q := r.db.WithContext(ctx).Where("unit_id = ?", unitID).Order("submitted_at DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	if offset > 0 {
		q = q.Offset(offset)
	}
	err := q.Find(&rows).Error
	return rows, err
}

func (r *surveyRepository) ListResponsesByClient(ctx context.Context, unitID, clientID string) ([]models.SurveyResponse, error) {
	var rows []models.SurveyResponse
	err := r.db.WithContext(ctx).Where("unit_id = ? AND client_id = ?", unitID, clientID).
		Order("submitted_at DESC").
		Find(&rows).Error
	return rows, err
}
