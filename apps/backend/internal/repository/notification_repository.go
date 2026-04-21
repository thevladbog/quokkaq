package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

// NotificationRepository manages Notification rows used by the async SMS/notification pipeline.
type NotificationRepository interface {
	Create(n *models.Notification) error
	FindByID(id string) (*models.Notification, error)
	UpdateStatus(id, status string, attempts int) error
}

type notificationRepository struct {
	db *gorm.DB
}

// NewNotificationRepository creates a new repository backed by the global DB.
func NewNotificationRepository() NotificationRepository {
	return &notificationRepository{db: database.DB}
}

func (r *notificationRepository) Create(n *models.Notification) error {
	return r.db.Create(n).Error
}

func (r *notificationRepository) FindByID(id string) (*models.Notification, error) {
	var n models.Notification
	if err := r.db.First(&n, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &n, nil
}

func (r *notificationRepository) UpdateStatus(id, status string, attempts int) error {
	now := time.Now()
	return r.db.Model(&models.Notification{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":   status,
			"attempts": attempts,
			"last_at":  now,
		}).Error
}
