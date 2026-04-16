package repository

import (
	"context"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// SSORepository persists OIDC and login-link data.
type SSORepository interface {
	GetConnectionByCompanyID(companyID string) (*models.CompanySSOConnection, error)
	UpsertConnection(conn *models.CompanySSOConnection) error
	FindCompaniesByEmailDomain(domain string) ([]models.Company, []models.CompanySSOConnection, error)
	FindExternalIdentity(issuer, subject string) (*models.UserExternalIdentity, error)
	CreateExternalIdentity(id *models.UserExternalIdentity) error
	FindLoginLinkByHash(tokenHash string) (*models.TenantLoginLink, error)
	CreateLoginLink(link *models.TenantLoginLink) error
	RevokeLoginLink(id string) error
	InsertSSOAudit(ctx context.Context, e *models.SSOAuditEvent) error
}

type ssoRepository struct{}

func NewSSORepository() SSORepository {
	return &ssoRepository{}
}

func (r *ssoRepository) GetConnectionByCompanyID(companyID string) (*models.CompanySSOConnection, error) {
	var c models.CompanySSOConnection
	err := database.DB.Where("company_id = ?", companyID).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *ssoRepository) UpsertConnection(conn *models.CompanySSOConnection) error {
	var existing models.CompanySSOConnection
	err := database.DB.Where("company_id = ?", conn.CompanyID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return database.DB.Create(conn).Error
	}
	if err != nil {
		return err
	}
	conn.ID = existing.ID
	return database.DB.Save(conn).Error
}

// FindCompaniesByEmailDomain returns companies whose SSO connection lists the domain (case-insensitive).
func (r *ssoRepository) FindCompaniesByEmailDomain(domain string) ([]models.Company, []models.CompanySSOConnection, error) {
	d := strings.ToLower(strings.TrimSpace(domain))
	if d == "" {
		return nil, nil, nil
	}
	var conns []models.CompanySSOConnection
	err := database.DB.Where("enabled = ?", true).Find(&conns).Error
	if err != nil {
		return nil, nil, err
	}
	type match struct {
		conn models.CompanySSOConnection
	}
	var matches []match
	for i := range conns {
		c := &conns[i]
		for _, dom := range c.EmailDomains {
			if strings.EqualFold(strings.TrimSpace(dom), d) {
				matches = append(matches, match{conn: *c})
				break
			}
		}
	}
	if len(matches) == 0 {
		return nil, nil, nil
	}
	seen := make(map[string]struct{}, len(matches))
	var ids []string
	for _, m := range matches {
		if _, ok := seen[m.conn.CompanyID]; ok {
			continue
		}
		seen[m.conn.CompanyID] = struct{}{}
		ids = append(ids, m.conn.CompanyID)
	}

	var companies []models.Company
	if err := database.DB.Where("id IN ?", ids).Find(&companies).Error; err != nil {
		return nil, nil, err
	}
	byID := make(map[string]models.Company, len(companies))
	for i := range companies {
		byID[companies[i].ID] = companies[i]
	}
	outCompanies := make([]models.Company, 0, len(matches))
	outConns := make([]models.CompanySSOConnection, 0, len(matches))
	for _, m := range matches {
		if comp, ok := byID[m.conn.CompanyID]; ok {
			outCompanies = append(outCompanies, comp)
			outConns = append(outConns, m.conn)
		}
	}
	return outCompanies, outConns, nil
}

func (r *ssoRepository) FindExternalIdentity(issuer, subject string) (*models.UserExternalIdentity, error) {
	var u models.UserExternalIdentity
	err := database.DB.Where("issuer = ? AND subject = ?", issuer, subject).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *ssoRepository) CreateExternalIdentity(id *models.UserExternalIdentity) error {
	return database.DB.Create(id).Error
}

func (r *ssoRepository) FindLoginLinkByHash(tokenHash string) (*models.TenantLoginLink, error) {
	var t models.TenantLoginLink
	err := database.DB.Where("token_hash = ? AND revoked = ? AND expires_at > ?", tokenHash, false, time.Now()).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *ssoRepository) CreateLoginLink(link *models.TenantLoginLink) error {
	return database.DB.Create(link).Error
}

func (r *ssoRepository) RevokeLoginLink(id string) error {
	return database.DB.Model(&models.TenantLoginLink{}).Where("id = ?", id).Update("revoked", true).Error
}

func (r *ssoRepository) InsertSSOAudit(ctx context.Context, e *models.SSOAuditEvent) error {
	return database.DB.WithContext(ctx).Create(e).Error
}
