package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// SupportReportListScope controls which support_reports rows ListForUser returns.
// PlatformWide (SaaS platform_admin): all tenants, up to the query limit.
// Otherwise: the viewer's own reports, shares, and — when TenantCompanyIDs is non-empty —
// every report whose author belongs to one of those companies (tenant system admin / company owner).
type SupportReportListScope struct {
	PlatformWide     bool
	TenantCompanyIDs []string
}

// SupportReportRepository persists support report rows.
type SupportReportRepository interface {
	Create(r *models.SupportReport) error
	FindByID(id string) (*models.SupportReport, error)
	ListForUser(userID string, scope SupportReportListScope) ([]models.SupportReport, error)
	Update(r *models.SupportReport) error
	DeleteByID(id string) error
}

type supportReportRepository struct {
	db *gorm.DB
}

// NewSupportReportRepository constructs a SupportReportRepository.
func NewSupportReportRepository() SupportReportRepository {
	return &supportReportRepository{db: database.DB}
}

func (r *supportReportRepository) Create(row *models.SupportReport) error {
	return r.db.Create(row).Error
}

func (r *supportReportRepository) FindByID(id string) (*models.SupportReport, error) {
	var row models.SupportReport
	if err := r.db.Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *supportReportRepository) ListForUser(userID string, scope SupportReportListScope) ([]models.SupportReport, error) {
	var rows []models.SupportReport
	q := r.db.Model(&models.SupportReport{}).Order("created_at DESC").Limit(500)
	shareSub := r.db.Model(&models.SupportReportShare{}).
		Select("support_report_id").
		Where("shared_with_user_id = ?", userID)
	if scope.PlatformWide {
		if err := q.Find(&rows).Error; err != nil {
			return nil, err
		}
		return rows, nil
	}
	if len(scope.TenantCompanyIDs) == 0 {
		q = q.Where("created_by_user_id = ? OR id IN (?)", userID, shareSub)
		if err := q.Find(&rows).Error; err != nil {
			return nil, err
		}
		return rows, nil
	}
	authorSub := r.db.Raw(`
SELECT DISTINCT user_id FROM (
  SELECT uu.user_id AS user_id FROM user_units uu
  INNER JOIN units u ON u.id = uu.unit_id
  WHERE u.company_id IN ?
  UNION
  SELECT utr.user_id AS user_id FROM user_tenant_roles utr
  WHERE utr.company_id IN ?
  UNION
  SELECT c.owner_user_id AS user_id FROM companies c
  WHERE c.id IN ? AND c.owner_user_id IS NOT NULL
) t WHERE user_id IS NOT NULL
`, scope.TenantCompanyIDs, scope.TenantCompanyIDs, scope.TenantCompanyIDs)
	q = q.Where("created_by_user_id = ? OR id IN (?) OR created_by_user_id IN (?)", userID, shareSub, authorSub)
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *supportReportRepository) Update(row *models.SupportReport) error {
	return r.db.Save(row).Error
}

func (r *supportReportRepository) DeleteByID(id string) error {
	return r.db.Delete(&models.SupportReport{}, "id = ?", id).Error
}
