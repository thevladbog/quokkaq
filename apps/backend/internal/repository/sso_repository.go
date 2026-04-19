package repository

import (
	"context"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SSORepository persists OIDC and login-link data.
type SSORepository interface {
	GetConnectionByCompanyID(companyID string) (*models.CompanySSOConnection, error)
	UpsertConnection(conn *models.CompanySSOConnection) error
	FindCompaniesByEmailDomain(domain string) ([]models.Company, []models.CompanySSOConnection, error)
	FindExternalIdentity(issuer, subject string) (*models.UserExternalIdentity, error)
	FindExternalIdentityByCompanyAndObjectID(companyID, externalObjectID string) (*models.UserExternalIdentity, error)
	FindExternalIdentityByUserAndCompany(userID, companyID string) (*models.UserExternalIdentity, error)
	UpdateExternalIdentity(id *models.UserExternalIdentity) error
	CreateExternalIdentity(id *models.UserExternalIdentity) error
	CreateExternalIdentityTx(tx *gorm.DB, id *models.UserExternalIdentity) error
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
	return database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "company_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"enabled",
			"sso_protocol",
			"saml_idp_metadata_url",
			"issuer_url",
			"client_id",
			"client_secret_encrypted",
			"email_domains",
			"scopes",
			"updated_at",
		}),
	}).Create(conn).Error
}

// FindCompaniesByEmailDomain returns companies whose SSO connection lists the domain (case-insensitive).
func (r *ssoRepository) FindCompaniesByEmailDomain(domain string) ([]models.Company, []models.CompanySSOConnection, error) {
	d := strings.ToLower(strings.TrimSpace(domain))
	if d == "" {
		return nil, nil, nil
	}
	var conns []models.CompanySSOConnection
	err := database.DB.Where(
		`enabled = ? AND EXISTS (
			SELECT 1 FROM unnest(COALESCE(email_domains, '{}'::text[])) AS dom
			WHERE lower(trim(dom)) = ?
		)`,
		true, d,
	).Find(&conns).Error
	if err != nil {
		return nil, nil, err
	}
	if len(conns) == 0 {
		return nil, nil, nil
	}
	seen := make(map[string]struct{}, len(conns))
	var ids []string
	for i := range conns {
		cid := conns[i].CompanyID
		if _, ok := seen[cid]; ok {
			continue
		}
		seen[cid] = struct{}{}
		ids = append(ids, cid)
	}

	var companies []models.Company
	if err := database.DB.Where("id IN ?", ids).Find(&companies).Error; err != nil {
		return nil, nil, err
	}
	byID := make(map[string]models.Company, len(companies))
	for i := range companies {
		byID[companies[i].ID] = companies[i]
	}
	outCompanies := make([]models.Company, 0, len(conns))
	outConns := make([]models.CompanySSOConnection, 0, len(conns))
	for i := range conns {
		c := conns[i]
		if comp, ok := byID[c.CompanyID]; ok {
			outCompanies = append(outCompanies, comp)
			outConns = append(outConns, c)
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

func (r *ssoRepository) FindExternalIdentityByUserAndCompany(userID, companyID string) (*models.UserExternalIdentity, error) {
	var u models.UserExternalIdentity
	err := database.DB.Where("user_id = ? AND company_id = ?", userID, companyID).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *ssoRepository) FindExternalIdentityByCompanyAndObjectID(companyID, externalObjectID string) (*models.UserExternalIdentity, error) {
	externalObjectID = strings.TrimSpace(externalObjectID)
	if companyID == "" || externalObjectID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var u models.UserExternalIdentity
	err := database.DB.Where("company_id = ? AND external_object_id = ?", companyID, externalObjectID).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *ssoRepository) UpdateExternalIdentity(id *models.UserExternalIdentity) error {
	return database.DB.Model(&models.UserExternalIdentity{}).Where("id = ?", id.ID).Updates(map[string]interface{}{
		"issuer":             id.Issuer,
		"subject":            id.Subject,
		"external_object_id": id.ExternalObjectID,
	}).Error
}

func (r *ssoRepository) CreateExternalIdentity(id *models.UserExternalIdentity) error {
	return database.DB.Create(id).Error
}

func (r *ssoRepository) CreateExternalIdentityTx(tx *gorm.DB, id *models.UserExternalIdentity) error {
	return tx.Create(id).Error
}

func (r *ssoRepository) FindLoginLinkByHash(tokenHash string) (*models.TenantLoginLink, error) {
	var t models.TenantLoginLink
	err := database.DB.Where("token_hash = ? AND revoked = ? AND expires_at > NOW()", tokenHash, false).First(&t).Error
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
