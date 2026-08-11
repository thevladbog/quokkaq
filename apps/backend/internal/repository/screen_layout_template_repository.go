package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrExperienceVersionConflict            = errors.New("experience version conflict")
	ErrExperienceAssignmentIncomplete       = errors.New("experience template and variant must both be set or both be cleared")
	ErrExperienceAssignmentIncompatible     = errors.New("experience assignment is incompatible with terminal")
	ErrExperienceTemplateUnpublished        = errors.New("experience template has no published version")
	ErrExperienceVariantNotFound            = errors.New("experience variant does not exist in the published definition")
	ErrExperiencePublishedDefinitionInvalid = errors.New("published experience definition is invalid")
	ErrExperienceVersionPaginationInvalid   = errors.New("invalid experience version pagination")
	ErrExperienceTemplateAssigned           = errors.New("experience template is assigned to a terminal")
)

// UnitExperienceAssignment preserves explicit unassignment semantics for a
// public queue-display unit.
type UnitExperienceAssignment struct {
	TemplateID *string
	VariantID  *string
}

// TerminalExperienceAssignment preserves omitted-vs-explicit assignment semantics.
// When Specified is false, existing assignment and acknowledgement fields are untouched.
type TerminalExperienceAssignment struct {
	Specified  bool
	TemplateID *string
	VariantID  *string
}

// ScreenLayoutTemplateRepository persists tenant screen layout templates.
type ScreenLayoutTemplateRepository interface {
	ListByCompany(companyID string) ([]models.ScreenLayoutTemplate, error)
	GetByIDAndCompany(id, companyID string) (*models.ScreenLayoutTemplate, error)
	Create(row *models.ScreenLayoutTemplate) error
	Update(row *models.ScreenLayoutTemplate) error
	Delete(id, companyID string) error
	Publish(ctx context.Context, companyID, templateID, publisherID string) (*models.ExperienceTemplateVersion, error)
	ListVersions(ctx context.Context, companyID, templateID string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error)
	Restore(ctx context.Context, companyID, templateID, sourceVersionID, publisherID string) (*models.ExperienceTemplateVersion, error)
	GetPublishedVersion(ctx context.Context, companyID, templateID string) (*models.ExperienceTemplateVersion, error)
	ResolveTerminalPublishedVersion(ctx context.Context, companyID, terminalID string) (*models.ExperienceTemplateVersion, string, error)
	UpdateTerminalWithExperience(ctx context.Context, companyID string, terminal *models.DesktopTerminal, assignment TerminalExperienceAssignment) error
	ResolveUnitQueueDisplayPublishedVersion(ctx context.Context, unitID, profile string) (*models.ExperienceTemplateVersion, string, error)
	UpdateUnitWithExperience(ctx context.Context, companyID, unitID string, assignment UnitExperienceAssignment) error
}

type screenLayoutTemplateRepository struct {
	db *gorm.DB
}

// NewScreenLayoutTemplateRepository constructs a GORM-backed repository.
func NewScreenLayoutTemplateRepository() ScreenLayoutTemplateRepository {
	return &screenLayoutTemplateRepository{db: database.DB}
}

// NewScreenLayoutTemplateRepositoryWithDB binds the repository to a transaction/test database.
func NewScreenLayoutTemplateRepositoryWithDB(db *gorm.DB) ScreenLayoutTemplateRepository {
	return &screenLayoutTemplateRepository{db: db}
}

func (r *screenLayoutTemplateRepository) ListByCompany(companyID string) ([]models.ScreenLayoutTemplate, error) {
	var out []models.ScreenLayoutTemplate
	err := r.db.Where("company_id = ?", companyID).Order("name ASC").Find(&out).Error
	return out, err
}

func (r *screenLayoutTemplateRepository) GetByIDAndCompany(id, companyID string) (*models.ScreenLayoutTemplate, error) {
	var row models.ScreenLayoutTemplate
	err := r.db.Where("id = ? AND company_id = ?", id, companyID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *screenLayoutTemplateRepository) Create(row *models.ScreenLayoutTemplate) error {
	if row.ID == "" {
		row.ID = uuid.NewString()
	}
	if strings.TrimSpace(row.Surface) == "" {
		row.Surface = experience.SurfaceQueueDisplay
	}
	return r.db.Create(row).Error
}

func (r *screenLayoutTemplateRepository) Update(row *models.ScreenLayoutTemplate) error {
	res := r.db.Model(&models.ScreenLayoutTemplate{}).
		Where("id = ? AND company_id = ?", row.ID, row.CompanyID).
		Updates(map[string]interface{}{
			"name":       row.Name,
			"definition": row.Definition,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *screenLayoutTemplateRepository) Delete(id, companyID string) error {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var template models.ScreenLayoutTemplate
		if err := tx.Select("id").Where("id = ? AND company_id = ?", id, companyID).First(&template).Error; err != nil {
			return err
		}
		var assigned int64
		if err := tx.Model(&models.DesktopTerminal{}).Where("experience_template_id = ?", template.ID).Count(&assigned).Error; err != nil {
			return err
		}
		if assigned > 0 {
			return ErrExperienceTemplateAssigned
		}
		var assignedToUnit int64
		if err := tx.Model(&models.Unit{}).Where("experience_template_id = ?", template.ID).Count(&assignedToUnit).Error; err != nil {
			return err
		}
		if assignedToUnit > 0 {
			return ErrExperienceTemplateAssigned
		}
		result := tx.Where("id = ? AND company_id = ?", template.ID, companyID).Delete(&models.ScreenLayoutTemplate{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
	if isExperienceAssignmentForeignKeyViolation(err) {
		return ErrExperienceTemplateAssigned
	}
	return err
}

func isExperienceAssignmentForeignKeyViolation(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23503" && pgErr.ConstraintName == "fk_desktop_terminal_experience_template"
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "foreign key constraint failed") && strings.Contains(message, "desktop")
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "unique constraint") || strings.Contains(message, "duplicate key")
}

func (r *screenLayoutTemplateRepository) Publish(ctx context.Context, companyID, templateID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	return r.createPublishedVersion(ctx, companyID, templateID, "", publisherID)
}

func (r *screenLayoutTemplateRepository) Restore(ctx context.Context, companyID, templateID, sourceVersionID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	return r.createPublishedVersion(ctx, companyID, templateID, sourceVersionID, publisherID)
}

func (r *screenLayoutTemplateRepository) createPublishedVersion(ctx context.Context, companyID, templateID, sourceVersionID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	for attempt := 0; attempt < 2; attempt++ {
		var created models.ExperienceTemplateVersion
		err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var template models.ScreenLayoutTemplate
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND company_id = ?", templateID, companyID).
				First(&template).Error; err != nil {
				return err
			}

			definition := template.Definition
			if sourceVersionID != "" {
				var source models.ExperienceTemplateVersion
				if err := tx.Where("id = ? AND template_id = ?", sourceVersionID, template.ID).First(&source).Error; err != nil {
					return err
				}
				definition = append([]byte(nil), source.Definition...)
			}
			if err := experience.ValidateDefinition(definition, template.Surface); err != nil {
				return err
			}

			var maxVersion int
			if err := tx.Model(&models.ExperienceTemplateVersion{}).
				Where("template_id = ?", template.ID).
				Select("COALESCE(MAX(version), 0)").
				Scan(&maxVersion).Error; err != nil {
				return err
			}
			var publisher *string
			if strings.TrimSpace(publisherID) != "" {
				publisherValue := publisherID
				publisher = &publisherValue
			}
			created = models.ExperienceTemplateVersion{
				ID:          uuid.NewString(),
				TemplateID:  template.ID,
				Version:     maxVersion + 1,
				Definition:  append([]byte(nil), definition...),
				PublishedBy: publisher,
				PublishedAt: time.Now().UTC(),
			}
			if err := tx.Create(&created).Error; err != nil {
				return err
			}
			result := tx.Model(&models.ScreenLayoutTemplate{}).
				Where("id = ? AND company_id = ?", template.ID, companyID).
				Updates(map[string]any{
					"published_version_id": created.ID,
					"updated_at":           time.Now().UTC(),
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
			return nil
		})
		if err == nil {
			return &created, nil
		}
		if !isUniqueViolation(err) {
			return nil, err
		}
		if attempt == 1 {
			return nil, ErrExperienceVersionConflict
		}
	}
	return nil, ErrExperienceVersionConflict
}

func (r *screenLayoutTemplateRepository) ListVersions(ctx context.Context, companyID, templateID string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error) {
	if limit < 1 || limit > 100 || (beforeVersion != nil && *beforeVersion < 1) {
		return nil, ErrExperienceVersionPaginationInvalid
	}
	var template models.ScreenLayoutTemplate
	if err := r.db.WithContext(ctx).Select("id").Where("id = ? AND company_id = ?", templateID, companyID).First(&template).Error; err != nil {
		return nil, err
	}
	versions := make([]models.ExperienceTemplateVersionMetadata, 0, limit+1)
	query := r.db.WithContext(ctx).
		Table("experience_template_versions").
		Select("id", "template_id", "version", "published_by", "published_at").
		Where("template_id = ?", template.ID)
	if beforeVersion != nil {
		query = query.Where("version < ?", *beforeVersion)
	}
	if err := query.Order("version DESC").Limit(limit + 1).Scan(&versions).Error; err != nil {
		return nil, err
	}
	hasMore := len(versions) > limit
	if hasMore {
		versions = versions[:limit]
	}
	page := &models.ExperienceTemplateVersionPage{Items: versions, HasMore: hasMore}
	if hasMore && len(versions) > 0 {
		next := versions[len(versions)-1].Version
		page.NextBeforeVersion = &next
	}
	return page, nil
}

func (r *screenLayoutTemplateRepository) GetPublishedVersion(ctx context.Context, companyID, templateID string) (*models.ExperienceTemplateVersion, error) {
	var version models.ExperienceTemplateVersion
	err := r.db.WithContext(ctx).
		Table("experience_template_versions AS version").
		Select("version.*").
		Joins("INNER JOIN screen_layout_templates AS template ON template.id = version.template_id AND template.published_version_id = version.id").
		Where("template.id = ? AND template.company_id = ?", templateID, companyID).
		First(&version).Error
	if err != nil {
		return nil, err
	}
	return &version, nil
}

func (r *screenLayoutTemplateRepository) ResolveUnitQueueDisplayPublishedVersion(ctx context.Context, unitID, profile string) (*models.ExperienceTemplateVersion, string, error) {
	type resolvedRow struct {
		models.ExperienceTemplateVersion
		AssignedVariantID string `gorm:"column:assigned_variant_id"`
		Surface           string `gorm:"column:template_surface"`
	}
	var resolved resolvedRow
	err := r.db.WithContext(ctx).
		Table("experience_template_versions AS version").
		Select("version.*, unit.experience_variant_id AS assigned_variant_id, template.surface AS template_surface").
		Joins("INNER JOIN screen_layout_templates AS template ON template.id = version.template_id AND template.published_version_id = version.id").
		Joins("INNER JOIN units AS unit ON unit.experience_template_id = template.id").
		Where("unit.id = ? AND template.surface = ?", unitID, experience.SurfaceQueueDisplay).
		First(&resolved).Error
	if err != nil {
		return nil, "", err
	}
	if err := experience.ValidateDefinition(resolved.Definition, experience.SurfaceQueueDisplay); err != nil {
		return nil, "", ErrExperiencePublishedDefinitionInvalid
	}
	variantID, err := experience.ResolveVariant(resolved.Definition, resolved.AssignedVariantID, profile)
	if err != nil {
		return nil, "", ErrExperienceVariantNotFound
	}
	version := resolved.ExperienceTemplateVersion
	return &version, variantID, nil
}

func (r *screenLayoutTemplateRepository) UpdateUnitWithExperience(ctx context.Context, companyID, unitID string, assignment UnitExperienceAssignment) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var unit models.Unit
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND company_id = ?", unitID, companyID).
			First(&unit).Error; err != nil {
			return err
		}

		if (assignment.TemplateID == nil) != (assignment.VariantID == nil) {
			return ErrExperienceAssignmentIncomplete
		}
		if assignment.TemplateID == nil {
			return tx.Model(&models.Unit{}).Where("id = ?", unit.ID).Updates(map[string]any{
				"experience_template_id": nil,
				"experience_variant_id":  nil,
				"updated_at":             time.Now().UTC(),
			}).Error
		}

		templateID := strings.TrimSpace(*assignment.TemplateID)
		variantID := strings.TrimSpace(*assignment.VariantID)
		if templateID == "" || variantID == "" {
			return ErrExperienceAssignmentIncomplete
		}
		var template models.ScreenLayoutTemplate
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND company_id = ?", templateID, companyID).
			First(&template).Error; err != nil {
			return err
		}
		if template.Surface != experience.SurfaceQueueDisplay {
			return ErrExperienceAssignmentIncompatible
		}
		if template.PublishedVersionID == nil || strings.TrimSpace(*template.PublishedVersionID) == "" {
			return ErrExperienceTemplateUnpublished
		}
		var published models.ExperienceTemplateVersion
		if err := tx.Where("id = ? AND template_id = ?", *template.PublishedVersionID, template.ID).First(&published).Error; err != nil {
			return ErrExperienceTemplateUnpublished
		}
		if err := experience.ValidateDefinition(published.Definition, template.Surface); err != nil {
			return ErrExperiencePublishedDefinitionInvalid
		}
		matched, err := experience.HasVariant(published.Definition, variantID)
		if err != nil {
			return ErrExperiencePublishedDefinitionInvalid
		}
		if !matched {
			return ErrExperienceVariantNotFound
		}
		return tx.Model(&models.Unit{}).Where("id = ?", unit.ID).Updates(map[string]any{
			"experience_template_id": templateID,
			"experience_variant_id":  variantID,
			"updated_at":             time.Now().UTC(),
		}).Error
	})
}

func (r *screenLayoutTemplateRepository) ResolveTerminalPublishedVersion(ctx context.Context, companyID, terminalID string) (*models.ExperienceTemplateVersion, string, error) {
	type resolvedRow struct {
		models.ExperienceTemplateVersion
		VariantID    string  `gorm:"column:experience_variant_id"`
		Surface      string  `gorm:"column:template_surface"`
		TerminalKind string  `gorm:"column:terminal_kind"`
		CounterID    *string `gorm:"column:terminal_counter_id"`
	}
	var resolved resolvedRow
	err := r.db.WithContext(ctx).
		Table("experience_template_versions AS version").
		Select("version.*, terminal.experience_variant_id, terminal.kind AS terminal_kind, terminal.counter_id AS terminal_counter_id, template.surface AS template_surface").
		Joins("INNER JOIN screen_layout_templates AS template ON template.id = version.template_id AND template.published_version_id = version.id").
		Joins("INNER JOIN desktop_terminals AS terminal ON terminal.experience_template_id = template.id").
		Joins("INNER JOIN units AS unit ON unit.id = terminal.unit_id AND unit.company_id = ?", companyID).
		Where("terminal.id = ? AND terminal.revoked_at IS NULL AND template.company_id = ?", terminalID, companyID).
		First(&resolved).Error
	if err != nil {
		return nil, "", err
	}
	if resolved.Surface != experience.SurfaceTicketStation || models.EffectiveTerminalKind(&models.DesktopTerminal{Kind: resolved.TerminalKind, CounterID: resolved.CounterID}) != models.DesktopTerminalKindKiosk {
		return nil, "", ErrExperienceAssignmentIncompatible
	}
	if err := experience.ValidateDefinition(resolved.Definition, resolved.Surface); err != nil {
		return nil, "", ErrExperiencePublishedDefinitionInvalid
	}
	matched, err := experience.HasVariant(resolved.Definition, resolved.VariantID)
	if err != nil {
		return nil, "", ErrExperiencePublishedDefinitionInvalid
	}
	if !matched {
		return nil, "", ErrExperienceVariantNotFound
	}
	version := resolved.ExperienceTemplateVersion
	return &version, resolved.VariantID, nil
}

func (r *screenLayoutTemplateRepository) UpdateTerminalWithExperience(ctx context.Context, companyID string, terminal *models.DesktopTerminal, assignment TerminalExperienceAssignment) error {
	if terminal == nil {
		return gorm.ErrRecordNotFound
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current models.DesktopTerminal
		unitIDs := tx.Model(&models.Unit{}).Select("id").Where("company_id = ?", companyID)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND unit_id IN (?)", terminal.ID, unitIDs).
			First(&current).Error; err != nil {
			return err
		}

		// Validate the destination unit before reading any template id so a
		// cross-tenant unit cannot be used as an existence oracle.
		var targetUnit models.Unit
		if err := tx.Select("id", "company_id").Where("id = ? AND company_id = ?", terminal.UnitID, companyID).First(&targetUnit).Error; err != nil {
			return err
		}

		templateID := current.ExperienceTemplateID
		variantID := current.ExperienceVariantID
		appliedVersionID := current.AppliedTemplateVersionID
		appliedAt := current.AppliedTemplateAt
		ackStatus := current.ExperienceAckStatus
		ackReason := current.ExperienceAckReasonCode
		ackAt := current.ExperienceAckAt

		if assignment.Specified {
			if (assignment.TemplateID == nil) != (assignment.VariantID == nil) {
				return ErrExperienceAssignmentIncomplete
			}
			if assignment.TemplateID == nil {
				templateID = nil
				variantID = nil
			} else {
				trimmedTemplateID := strings.TrimSpace(*assignment.TemplateID)
				trimmedVariantID := strings.TrimSpace(*assignment.VariantID)
				if trimmedTemplateID == "" || trimmedVariantID == "" {
					return ErrExperienceAssignmentIncomplete
				}
				if models.EffectiveTerminalKind(terminal) != models.DesktopTerminalKindKiosk {
					return ErrExperienceAssignmentIncompatible
				}
				var template models.ScreenLayoutTemplate
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
					Where("id = ? AND company_id = ?", trimmedTemplateID, companyID).
					First(&template).Error; err != nil {
					return err
				}
				if template.Surface != experience.SurfaceTicketStation {
					return ErrExperienceAssignmentIncompatible
				}
				if template.PublishedVersionID == nil || strings.TrimSpace(*template.PublishedVersionID) == "" {
					return ErrExperienceTemplateUnpublished
				}
				var published models.ExperienceTemplateVersion
				if err := tx.Where("id = ? AND template_id = ?", *template.PublishedVersionID, template.ID).First(&published).Error; err != nil {
					return ErrExperienceTemplateUnpublished
				}
				if err := experience.ValidateDefinition(published.Definition, template.Surface); err != nil {
					return ErrExperiencePublishedDefinitionInvalid
				}
				matched, err := experience.HasVariant(published.Definition, trimmedVariantID)
				if err != nil {
					return ErrExperiencePublishedDefinitionInvalid
				}
				if !matched {
					return ErrExperienceVariantNotFound
				}
				templateID = &trimmedTemplateID
				variantID = &trimmedVariantID
			}
			// A deliberate assignment or unassignment starts a fresh server-owned
			// acknowledgement lifecycle; clients cannot write these fields here.
			appliedVersionID = nil
			appliedAt = nil
			ackStatus = nil
			ackReason = nil
			ackAt = nil
		} else if templateID != nil && models.EffectiveTerminalKind(terminal) != models.DesktopTerminalKindKiosk {
			return ErrExperienceAssignmentIncompatible
		}

		result := tx.Model(&models.DesktopTerminal{}).Where("id = ?", current.ID).Updates(map[string]any{
			"unit_id":                     terminal.UnitID,
			"counter_id":                  terminal.CounterID,
			"kind":                        terminal.Kind,
			"name":                        terminal.Name,
			"default_locale":              terminal.DefaultLocale,
			"kiosk_fullscreen":            terminal.KioskFullscreen,
			"experience_template_id":      templateID,
			"experience_variant_id":       variantID,
			"applied_template_version_id": appliedVersionID,
			"applied_template_at":         appliedAt,
			"experience_ack_status":       ackStatus,
			"experience_ack_reason_code":  ackReason,
			"experience_ack_at":           ackAt,
			"updated_at":                  time.Now().UTC(),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}
