package repository

import (
	"context"
	"encoding/json"
	"strings"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

type WebhookEndpointRepository interface {
	Create(ctx context.Context, row *models.WebhookEndpoint) error
	Update(ctx context.Context, row *models.WebhookEndpoint) error
	CountByCompany(ctx context.Context, companyID string) (int64, error)
	ListByCompany(ctx context.Context, companyID string) ([]models.WebhookEndpoint, error)
	GetByIDAndCompany(ctx context.Context, id, companyID string) (*models.WebhookEndpoint, error)
	Delete(ctx context.Context, id, companyID string) error
	ListEnabledForCompanyAndEvent(ctx context.Context, companyID, unitID, action string) ([]models.WebhookEndpoint, error)
	IncrementFailures(ctx context.Context, id string, delta int) error
	ResetFailures(ctx context.Context, id string) error
}

type webhookEndpointRepository struct {
	db *gorm.DB
}

func NewWebhookEndpointRepository(db *gorm.DB) WebhookEndpointRepository {
	return &webhookEndpointRepository{db: db}
}

func (r *webhookEndpointRepository) Create(ctx context.Context, row *models.WebhookEndpoint) error {
	return r.db.WithContext(ctx).Create(row).Error
}

func (r *webhookEndpointRepository) Update(ctx context.Context, row *models.WebhookEndpoint) error {
	return r.db.WithContext(ctx).Save(row).Error
}

func (r *webhookEndpointRepository) CountByCompany(ctx context.Context, companyID string) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.WebhookEndpoint{}).Where("company_id = ?", companyID).Count(&n).Error
	return n, err
}

func (r *webhookEndpointRepository) ListByCompany(ctx context.Context, companyID string) ([]models.WebhookEndpoint, error) {
	var rows []models.WebhookEndpoint
	err := r.db.WithContext(ctx).Where("company_id = ?", companyID).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *webhookEndpointRepository) GetByIDAndCompany(ctx context.Context, id, companyID string) (*models.WebhookEndpoint, error) {
	var row models.WebhookEndpoint
	err := r.db.WithContext(ctx).Where("id = ? AND company_id = ?", id, companyID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *webhookEndpointRepository) Delete(ctx context.Context, id, companyID string) error {
	res := r.db.WithContext(ctx).Where("id = ? AND company_id = ?", id, companyID).Delete(&models.WebhookEndpoint{})
	return res.Error
}

func (r *webhookEndpointRepository) ListEnabledForCompanyAndEvent(ctx context.Context, companyID, unitID, action string) ([]models.WebhookEndpoint, error) {
	var rows []models.WebhookEndpoint
	q := r.db.WithContext(ctx).Where("company_id = ? AND enabled = ?", companyID, true)
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := rows[:0]
	for i := range rows {
		ep := &rows[i]
		if ep.UnitID != nil && strings.TrimSpace(*ep.UnitID) != "" {
			if unitID == "" || !strings.EqualFold(strings.TrimSpace(*ep.UnitID), strings.TrimSpace(unitID)) {
				continue
			}
		}
		if !webhookEndpointSubscribes(ep.EventTypes, action) {
			continue
		}
		out = append(out, *ep)
	}
	return out, nil
}

func webhookEndpointSubscribes(raw json.RawMessage, action string) bool {
	action = strings.TrimSpace(action)
	if action == "" {
		return false
	}
	var types []string
	if len(raw) == 0 || string(raw) == "null" {
		return false
	}
	if err := json.Unmarshal(raw, &types); err != nil {
		return false
	}
	for _, t := range types {
		if strings.EqualFold(strings.TrimSpace(t), action) {
			return true
		}
	}
	return false
}

func (r *webhookEndpointRepository) IncrementFailures(ctx context.Context, id string, delta int) error {
	return r.db.WithContext(ctx).Model(&models.WebhookEndpoint{}).Where("id = ?", id).
		UpdateColumn("consecutive_failures", gorm.Expr("consecutive_failures + ?", delta)).Error
}

func (r *webhookEndpointRepository) ResetFailures(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Model(&models.WebhookEndpoint{}).Where("id = ?", id).
		Update("consecutive_failures", 0).Error
}
