package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrExperienceAcknowledgementVersionNotCurrent = errors.New("experience acknowledgement version is not current")

type DesktopTerminalRepository interface {
	Create(t *models.DesktopTerminal) error
	FindAll() ([]models.DesktopTerminal, error)
	// FindAllByCompanyID lists terminals whose primary unit belongs to the company.
	FindAllByCompanyID(companyID string) ([]models.DesktopTerminal, error)
	FindByID(id string) (*models.DesktopTerminal, error)
	// FindActiveByID returns a non-revoked terminal and its owning unit for a terminal-authenticated request.
	FindActiveByID(ctx context.Context, id string) (*models.DesktopTerminal, error)
	// AcknowledgeExperience records a result only for the terminal's current published assignment.
	AcknowledgeExperience(ctx context.Context, terminalID, versionID, status string, reasonCode *string) error
	// Revoke marks an active terminal revoked without overwriting deployment state.
	Revoke(ctx context.Context, terminalID string) error
	// TouchLastSeen records terminal activity without allowing a stale bootstrap
	// read to restore a concurrently revoked terminal.
	TouchLastSeen(ctx context.Context, terminalID string) error
	FindByPairingCodeDigest(digest string) (*models.DesktopTerminal, error)
	Update(t *models.DesktopTerminal) error
}

type desktopTerminalRepository struct {
	db *gorm.DB
}

func NewDesktopTerminalRepository() DesktopTerminalRepository {
	return &desktopTerminalRepository{db: database.DB}
}

func (r *desktopTerminalRepository) Create(t *models.DesktopTerminal) error {
	return r.db.Create(t).Error
}

func (r *desktopTerminalRepository) FindAll() ([]models.DesktopTerminal, error) {
	var rows []models.DesktopTerminal
	err := r.db.Preload("Unit", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
	}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *desktopTerminalRepository) FindAllByCompanyID(companyID string) ([]models.DesktopTerminal, error) {
	var rows []models.DesktopTerminal
	err := r.db.Joins("INNER JOIN units ON units.id = desktop_terminals.unit_id AND units.company_id = ?", companyID).
		Preload("Unit", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
		}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).Order("desktop_terminals.created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *desktopTerminalRepository) FindByID(id string) (*models.DesktopTerminal, error) {
	var t models.DesktopTerminal
	err := r.db.Preload("Unit", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "company_id", "code", "timezone", "created_at", "updated_at")
	}).Preload("Counter", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "unit_id", "name", "service_zone_id")
	}).First(&t, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *desktopTerminalRepository) FindActiveByID(ctx context.Context, id string) (*models.DesktopTerminal, error) {
	id = strings.TrimSpace(id)
	var terminal models.DesktopTerminal
	err := r.db.WithContext(ctx).
		Preload("Unit").
		Where("id = ? AND revoked_at IS NULL", id).
		First(&terminal).Error
	if err != nil {
		return nil, err
	}
	return &terminal, nil
}

// AcknowledgeExperience locks the terminal and its assigned template before
// comparing the requested version with the current published pointer. This
// makes publication and reassignment races resolve as a stable conflict rather
// than recording an acknowledgement against a stale deployment.
func (r *desktopTerminalRepository) AcknowledgeExperience(ctx context.Context, terminalID, versionID, status string, reasonCode *string) error {
	terminalID = strings.TrimSpace(terminalID)
	versionID = strings.TrimSpace(versionID)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var terminal models.DesktopTerminal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND revoked_at IS NULL", terminalID).
			First(&terminal).Error; err != nil {
			return err
		}
		if models.EffectiveTerminalKind(&terminal) != models.DesktopTerminalKindKiosk || terminal.ExperienceTemplateID == nil || terminal.ExperienceVariantID == nil || strings.TrimSpace(*terminal.ExperienceTemplateID) == "" || strings.TrimSpace(*terminal.ExperienceVariantID) == "" {
			return ErrExperienceAcknowledgementVersionNotCurrent
		}

		var template models.ScreenLayoutTemplate
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", *terminal.ExperienceTemplateID).
			First(&template).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrExperienceAcknowledgementVersionNotCurrent
			}
			return err
		}
		if template.PublishedVersionID == nil || strings.TrimSpace(*template.PublishedVersionID) != versionID {
			return ErrExperienceAcknowledgementVersionNotCurrent
		}

		var version models.ExperienceTemplateVersion
		if err := tx.Where("id = ? AND template_id = ?", versionID, template.ID).First(&version).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrExperienceAcknowledgementVersionNotCurrent
			}
			return err
		}
		now := time.Now().UTC()
		updates := map[string]any{
			"experience_ack_status":      status,
			"experience_ack_reason_code": reasonCode,
			"experience_ack_at":          now,
			"updated_at":                 now,
		}
		switch status {
		case "applied":
			if err := experience.ValidateDefinition(version.Definition, template.Surface); err != nil {
				return ErrExperienceAcknowledgementVersionNotCurrent
			}
			matched, err := experience.HasVariant(version.Definition, strings.TrimSpace(*terminal.ExperienceVariantID))
			if err != nil || !matched {
				return ErrExperienceAcknowledgementVersionNotCurrent
			}
			updates["applied_template_version_id"] = version.ID
			updates["applied_template_at"] = now
		case "rejected":
			// Keep the last successful application intact: this acknowledgement
			// describes the current failed deployment, not a rollback of history.
		default:
			return ErrExperienceAcknowledgementVersionNotCurrent
		}
		result := tx.Model(&models.DesktopTerminal{}).
			Where("id = ? AND revoked_at IS NULL", terminal.ID).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

// Revoke changes only the lifecycle columns so a concurrent acknowledgement
// that committed first cannot be overwritten by a stale whole-row Save.
func (r *desktopTerminalRepository) Revoke(ctx context.Context, terminalID string) error {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&models.DesktopTerminal{}).
		Where("id = ? AND revoked_at IS NULL", strings.TrimSpace(terminalID)).
		Updates(map[string]any{
			"revoked_at": now,
			"updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// TouchLastSeen updates only activity metadata and never writes an in-memory
// terminal row back to the database. In particular, it cannot clear revoked_at
// after the terminal was revoked between bootstrap authentication and this
// best-effort touch.
func (r *desktopTerminalRepository) TouchLastSeen(ctx context.Context, terminalID string) error {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&models.DesktopTerminal{}).
		Where("id = ? AND revoked_at IS NULL", strings.TrimSpace(terminalID)).
		Updates(map[string]any{
			"last_seen_at": now,
			"updated_at":   now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *desktopTerminalRepository) FindByPairingCodeDigest(digest string) (*models.DesktopTerminal, error) {
	var t models.DesktopTerminal
	err := r.db.First(&t, "pairing_code_digest = ?", digest).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *desktopTerminalRepository) Update(t *models.DesktopTerminal) error {
	return r.db.Save(t).Error
}
