package repository

import (
	"context"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SignageRepository persists digital signage entities (playlists, schedules, feeds, announcements).
type SignageRepository interface {
	// Playlists
	ListPlaylistsByUnit(unitID string) ([]models.Playlist, error)
	CountPlaylistsByUnitWithName(unitID, name string) (int64, error)
	GetPlaylistByID(id string) (*models.Playlist, error)
	GetPlaylistByIDWithItems(id string) (*models.Playlist, error)
	CreatePlaylist(p *models.Playlist) error
	UpdatePlaylist(p *models.Playlist) error
	DeletePlaylist(id string) error
	ReplacePlaylistItems(playlistID string, items []models.PlaylistItem) error
	UnsetDefaultPlaylistsForUnit(exceptID, unitID string) error
	// Schedules
	ListSchedulesByUnit(unitID string) ([]models.PlaylistSchedule, error)
	GetScheduleByID(id string) (*models.PlaylistSchedule, error)
	CreateSchedule(s *models.PlaylistSchedule) error
	UpdateSchedule(s *models.PlaylistSchedule) error
	DeleteSchedule(id string) error
	// Feeds
	ListFeedsByUnit(unitID string) ([]models.ExternalFeed, error)
	GetFeedByID(id string) (*models.ExternalFeed, error)
	CreateFeed(f *models.ExternalFeed) error
	UpdateFeed(f *models.ExternalFeed) error
	DeleteFeed(id string) error
	// WithFeedLockedForUpdate loads the row FOR UPDATE, runs fn (mutates the in-memory struct), then saves.
	// Serializes polling so concurrent pollers for the same feed cannot clobber [ExternalFeed] updates.
	WithFeedLockedForUpdate(ctx context.Context, feedID string, fn func(*models.ExternalFeed) error) error
	// For poller: active feeds with stale last fetch
	ListActiveFeeds() ([]models.ExternalFeed, error)
	// Announcements
	ListAnnouncementsByUnit(unitID string, includeInactive bool) ([]models.ScreenAnnouncement, error)
	ListActiveAnnouncementsForPublic(unitID string) ([]models.ScreenAnnouncement, error)
	GetAnnouncementByID(id string) (*models.ScreenAnnouncement, error)
	CreateAnnouncement(a *models.ScreenAnnouncement) error
	UpdateAnnouncement(a *models.ScreenAnnouncement) error
	DeleteAnnouncement(id string) error
}

type signageRepository struct {
	db *gorm.DB
}

// NewSignageRepository constructs a GORM-backed signage repository.
func NewSignageRepository() SignageRepository {
	return &signageRepository{db: database.DB}
}

func (r *signageRepository) ListPlaylistsByUnit(unitID string) ([]models.Playlist, error) {
	var out []models.Playlist
	err := r.db.Where("unit_id = ?", unitID).Order("name ASC").Find(&out).Error
	return out, err
}

func (r *signageRepository) CountPlaylistsByUnitWithName(unitID, name string) (int64, error) {
	var c int64
	err := r.db.Model(&models.Playlist{}).Where("unit_id = ? AND name = ?", unitID, name).Count(&c).Error
	return c, err
}

func (r *signageRepository) GetPlaylistByID(id string) (*models.Playlist, error) {
	var p models.Playlist
	err := r.db.Where("id = ?", id).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *signageRepository) GetPlaylistByIDWithItems(id string) (*models.Playlist, error) {
	var p models.Playlist
	err := r.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order ASC")
	}).Preload("Items.Material").Where("id = ?", id).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *signageRepository) CreatePlaylist(p *models.Playlist) error {
	return r.db.Create(p).Error
}

func (r *signageRepository) UpdatePlaylist(p *models.Playlist) error {
	return r.db.Save(p).Error
}

func (r *signageRepository) DeletePlaylist(id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("playlist_id = ?", id).Delete(&models.PlaylistItem{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.PlaylistSchedule{}, "playlist_id = ?", id).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Playlist{}, "id = ?", id).Error
	})
}

func (r *signageRepository) ReplacePlaylistItems(playlistID string, items []models.PlaylistItem) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("playlist_id = ?", playlistID).Delete(&models.PlaylistItem{}).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		// batch insert
		return tx.Create(&items).Error
	})
}

func (r *signageRepository) UnsetDefaultPlaylistsForUnit(exceptID, unitID string) error {
	return r.db.Model(&models.Playlist{}).Where("unit_id = ? AND id <> ? AND is_default = ?", unitID, exceptID, true).
		Update("is_default", false).Error
}

func (r *signageRepository) ListSchedulesByUnit(unitID string) ([]models.PlaylistSchedule, error) {
	var out []models.PlaylistSchedule
	err := r.db.Preload("Playlist").Where("unit_id = ?", unitID).Order("priority DESC, start_time").Find(&out).Error
	return out, err
}

func (r *signageRepository) GetScheduleByID(id string) (*models.PlaylistSchedule, error) {
	var s models.PlaylistSchedule
	err := r.db.Preload("Playlist").Where("id = ?", id).First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *signageRepository) CreateSchedule(s *models.PlaylistSchedule) error {
	return r.db.Create(s).Error
}

func (r *signageRepository) UpdateSchedule(s *models.PlaylistSchedule) error {
	return r.db.Save(s).Error
}

func (r *signageRepository) DeleteSchedule(id string) error {
	return r.db.Delete(&models.PlaylistSchedule{}, "id = ?", id).Error
}

func (r *signageRepository) ListFeedsByUnit(unitID string) ([]models.ExternalFeed, error) {
	var out []models.ExternalFeed
	err := r.db.Where("unit_id = ?", unitID).Order("name ASC").Find(&out).Error
	return out, err
}

func (r *signageRepository) GetFeedByID(id string) (*models.ExternalFeed, error) {
	var f models.ExternalFeed
	err := r.db.Where("id = ?", id).First(&f).Error
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (r *signageRepository) CreateFeed(f *models.ExternalFeed) error {
	return r.db.Create(f).Error
}

func (r *signageRepository) UpdateFeed(f *models.ExternalFeed) error {
	return r.db.Save(f).Error
}

func (r *signageRepository) DeleteFeed(id string) error {
	return r.db.Delete(&models.ExternalFeed{}, "id = ?", id).Error
}

func (r *signageRepository) WithFeedLockedForUpdate(ctx context.Context, feedID string, fn func(*models.ExternalFeed) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var f models.ExternalFeed
		if err := tx.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", feedID).First(&f).Error; err != nil {
			return err
		}
		if err := fn(&f); err != nil {
			return err
		}
		return tx.WithContext(ctx).Session(&gorm.Session{FullSaveAssociations: true}).Save(&f).Error
	})
}

func (r *signageRepository) ListActiveFeeds() ([]models.ExternalFeed, error) {
	var out []models.ExternalFeed
	err := r.db.Where("is_active = ?", true).Find(&out).Error
	return out, err
}

func (r *signageRepository) ListAnnouncementsByUnit(unitID string, includeInactive bool) ([]models.ScreenAnnouncement, error) {
	q := r.db.Where("unit_id = ?", unitID).Order("priority DESC, created_at DESC")
	if !includeInactive {
		q = q.Where("is_active = ?", true)
	}
	var out []models.ScreenAnnouncement
	err := q.Find(&out).Error
	return out, err
}

func (r *signageRepository) ListActiveAnnouncementsForPublic(unitID string) ([]models.ScreenAnnouncement, error) {
	var out []models.ScreenAnnouncement
	err := r.db.Where("unit_id = ? AND is_active = ?", unitID, true).
		Where("(starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())").
		Order("priority DESC, created_at ASC").
		Find(&out).Error
	return out, err
}

func (r *signageRepository) GetAnnouncementByID(id string) (*models.ScreenAnnouncement, error) {
	var a models.ScreenAnnouncement
	err := r.db.Where("id = ?", id).First(&a).Error
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *signageRepository) CreateAnnouncement(a *models.ScreenAnnouncement) error {
	return r.db.Create(a).Error
}

func (r *signageRepository) UpdateAnnouncement(a *models.ScreenAnnouncement) error {
	return r.db.Save(a).Error
}

func (r *signageRepository) DeleteAnnouncement(id string) error {
	return r.db.Delete(&models.ScreenAnnouncement{}, "id = ?", id).Error
}
