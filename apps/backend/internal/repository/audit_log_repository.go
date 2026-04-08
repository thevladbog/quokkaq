package repository

import (
	"context"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// AuditLogRepository persists audit trail entries (GORM).
type AuditLogRepository interface {
	CreateAuditLog(ctx context.Context, log *models.AuditLog) error
}

type auditLogRepository struct {
	db *gorm.DB
}

// NewAuditLogRepository returns a GORM-backed audit log repository.
func NewAuditLogRepository() AuditLogRepository {
	return &auditLogRepository{db: database.DB}
}

func (r *auditLogRepository) CreateAuditLog(ctx context.Context, log *models.AuditLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}
