package repository

import (
	"context"
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

type IntegrationAPIKeyRepository interface {
	Create(ctx context.Context, key *models.IntegrationAPIKey) error
	ListByCompany(ctx context.Context, companyID string) ([]models.IntegrationAPIKey, error)
	CountActiveByCompany(ctx context.Context, companyID string) (int64, error)
	FindActiveByIDAndCompany(ctx context.Context, id, companyID string) (*models.IntegrationAPIKey, error)
	Revoke(ctx context.Context, id, companyID string) error
	TouchLastUsed(ctx context.Context, id string) error
}

type integrationAPIKeyRepository struct {
	db *gorm.DB
}

func NewIntegrationAPIKeyRepository(db *gorm.DB) IntegrationAPIKeyRepository {
	return &integrationAPIKeyRepository{db: db}
}

func (r *integrationAPIKeyRepository) Create(ctx context.Context, key *models.IntegrationAPIKey) error {
	return r.db.WithContext(ctx).Create(key).Error
}

func (r *integrationAPIKeyRepository) ListByCompany(ctx context.Context, companyID string) ([]models.IntegrationAPIKey, error) {
	var rows []models.IntegrationAPIKey
	err := r.db.WithContext(ctx).Where("company_id = ?", companyID).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *integrationAPIKeyRepository) CountActiveByCompany(ctx context.Context, companyID string) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.IntegrationAPIKey{}).
		Where("company_id = ? AND revoked_at IS NULL", companyID).Count(&n).Error
	return n, err
}

func (r *integrationAPIKeyRepository) FindActiveByIDAndCompany(ctx context.Context, id, companyID string) (*models.IntegrationAPIKey, error) {
	var row models.IntegrationAPIKey
	err := r.db.WithContext(ctx).Where("id = ? AND company_id = ? AND revoked_at IS NULL", id, companyID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *integrationAPIKeyRepository) Revoke(ctx context.Context, id, companyID string) error {
	res := r.db.WithContext(ctx).Model(&models.IntegrationAPIKey{}).
		Where("id = ? AND company_id = ? AND revoked_at IS NULL", id, companyID).
		Update("revoked_at", gorm.Expr("now()"))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *integrationAPIKeyRepository) TouchLastUsed(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Model(&models.IntegrationAPIKey{}).Where("id = ?", id).
		Update("last_used_at", gorm.Expr("now()")).Error
}

// FindActiveByIDForAuth loads a non-revoked key by primary key (integration middleware).
func FindIntegrationAPIKeyByIDForAuth(ctx context.Context, db *gorm.DB, id string) (*models.IntegrationAPIKey, error) {
	var row models.IntegrationAPIKey
	err := db.WithContext(ctx).Where("id = ? AND revoked_at IS NULL", id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// ErrIntegrationTokenMalformed is returned when the qqk_ token format is invalid.
var ErrIntegrationTokenMalformed = errors.New("malformed integration API token")

// ParseIntegrationAPIToken splits qqk_<uuid>_<secretHex> into id and secret.
func ParseIntegrationAPIToken(raw string) (id string, secret string, err error) {
	s := strings.TrimSpace(raw)
	const pfx = "qqk_"
	if !strings.HasPrefix(s, pfx) {
		return "", "", ErrIntegrationTokenMalformed
	}
	rest := s[len(pfx):]
	idx := strings.LastIndex(rest, "_")
	if idx <= 0 || idx >= len(rest)-1 {
		return "", "", ErrIntegrationTokenMalformed
	}
	id = strings.TrimSpace(rest[:idx])
	secret = strings.TrimSpace(rest[idx+1:])
	if id == "" || secret == "" {
		return "", "", ErrIntegrationTokenMalformed
	}
	return id, secret, nil
}
