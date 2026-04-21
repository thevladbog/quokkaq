// Package testsupport provides shared test doubles; import only from *_test.go files.
// Must not import internal/services (would create an import cycle with services tests).
package testsupport

import (
	"context"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// PanicCompanyRepo satisfies repository.CompanyRepository and panics on any call.
type PanicCompanyRepo struct{}

func (PanicCompanyRepo) FindByID(string) (*models.Company, error)            { panic("unexpected") }
func (PanicCompanyRepo) FindByIDWithBilling(string) (*models.Company, error) { panic("unexpected") }
func (PanicCompanyRepo) FindBySlug(string) (*models.Company, error)          { panic("unexpected") }
func (PanicCompanyRepo) FindSaaSOperatorCompany() (*models.Company, error)   { panic("unexpected") }
func (PanicCompanyRepo) ListPaginated(string, int, int) ([]models.Company, int64, error) {
	panic("unexpected")
}
func (PanicCompanyRepo) Update(*models.Company) error                    { panic("unexpected") }
func (PanicCompanyRepo) IsSlugTakenByOther(string, string) (bool, error) { panic("unexpected") }

// StrictPublicTenantCompanyRepo returns a strict company for FindBySlug only.
type StrictPublicTenantCompanyRepo struct{}

func (StrictPublicTenantCompanyRepo) FindByID(string) (*models.Company, error) { panic("unexpected") }
func (StrictPublicTenantCompanyRepo) FindByIDWithBilling(string) (*models.Company, error) {
	panic("unexpected")
}
func (StrictPublicTenantCompanyRepo) FindBySlug(string) (*models.Company, error) {
	return &models.Company{
		Slug:                      "acme-corp",
		Name:                      "Acme",
		StrictPublicTenantResolve: true,
	}, nil
}
func (StrictPublicTenantCompanyRepo) FindSaaSOperatorCompany() (*models.Company, error) {
	panic("unexpected")
}
func (StrictPublicTenantCompanyRepo) ListPaginated(string, int, int) ([]models.Company, int64, error) {
	panic("unexpected")
}
func (StrictPublicTenantCompanyRepo) Update(*models.Company) error { panic("unexpected") }
func (StrictPublicTenantCompanyRepo) IsSlugTakenByOther(string, string) (bool, error) {
	panic("unexpected")
}

// PanicUserRepo satisfies repository.UserRepository and panics on any call.
type PanicUserRepo struct{}

func (PanicUserRepo) Create(*models.User) error             { panic("unexpected") }
func (PanicUserRepo) CreateTx(*gorm.DB, *models.User) error { panic("unexpected") }
func (PanicUserRepo) FindAll(string) ([]models.User, error) { panic("unexpected") }
func (PanicUserRepo) ListUsersForCompany(string, string, bool) ([]models.User, error) {
	panic("unexpected")
}
func (PanicUserRepo) FindByID(context.Context, string) (*models.User, error)    { panic("unexpected") }
func (PanicUserRepo) FindByIDTx(*gorm.DB, string) (*models.User, error)         { panic("unexpected") }
func (PanicUserRepo) FindByEmail(context.Context, string) (*models.User, error) { panic("unexpected") }
func (PanicUserRepo) Update(*models.User) error                                 { panic("unexpected") }
func (PanicUserRepo) UpdateTx(*gorm.DB, *models.User) error                     { panic("unexpected") }
func (PanicUserRepo) Delete(string) error                                       { panic("unexpected") }
func (PanicUserRepo) AssignUnit(string, string, []string) error                 { panic("unexpected") }
func (PanicUserRepo) CreateUserUnitTx(*gorm.DB, *models.UserUnit) error         { panic("unexpected") }
func (PanicUserRepo) RemoveUnit(string, string) error                           { panic("unexpected") }
func (PanicUserRepo) AssignRole(string, string) error                           { panic("unexpected") }
func (PanicUserRepo) AssignRoleTx(*gorm.DB, string, string) error               { panic("unexpected") }
func (PanicUserRepo) RemoveUserRoleByName(string, string) error                 { panic("unexpected") }
func (PanicUserRepo) RemoveUserRoleByNameTx(*gorm.DB, string, string) error     { panic("unexpected") }
func (PanicUserRepo) FindRoleByName(string) (*models.Role, error)               { panic("unexpected") }
func (PanicUserRepo) CreatePasswordResetToken(*models.PasswordResetToken) error { panic("unexpected") }
func (PanicUserRepo) FindPasswordResetToken(string) (*models.PasswordResetToken, error) {
	panic("unexpected")
}
func (PanicUserRepo) DeletePasswordResetToken(string) error                     { panic("unexpected") }
func (PanicUserRepo) Count() (int64, error)                                     { panic("unexpected") }
func (PanicUserRepo) EnsureRoleExists(string) (*models.Role, error)             { panic("unexpected") }
func (PanicUserRepo) EnsureRoleExistsTx(*gorm.DB, string) (*models.Role, error) { panic("unexpected") }
func (PanicUserRepo) IsAdmin(string) (bool, error)                              { panic("unexpected") }
func (PanicUserRepo) ListUserIDsByRoleNames([]string) ([]string, error)         { panic("unexpected") }
func (PanicUserRepo) ListUserRoleNamesTx(*gorm.DB, string) ([]string, error)    { panic("unexpected") }
func (PanicUserRepo) IsPlatformAdmin(string) (bool, error)                      { panic("unexpected") }
func (PanicUserRepo) IsAdminOrHasUnitAccess(string, string) (bool, error)       { panic("unexpected") }
func (PanicUserRepo) HasCompanyAccess(string, string) (bool, error)             { panic("unexpected") }
func (PanicUserRepo) IsCompanyOwner(string, string) (bool, error)               { panic("unexpected") }
func (PanicUserRepo) GetCompanyIDByUserID(string) (string, error)               { panic("unexpected") }
func (PanicUserRepo) ResolveCompanyIDForRequest(string, string) (string, error) {
	panic("unexpected")
}
func (PanicUserRepo) IsUserMemberOfCompanyTenant(string, string) (bool, error) { panic("unexpected") }
func (PanicUserRepo) ListAccessibleCompanies(string, string) ([]repository.AccessibleCompanySummary, error) {
	panic("unexpected")
}
func (PanicUserRepo) GetFirstUserUnit(string) (repository.UserUnitResult, error) {
	panic("unexpected")
}
func (PanicUserRepo) ListSupportReportShareCandidates(string, string, string, string, int) ([]repository.SupportReportShareCandidate, error) {
	panic("unexpected")
}
func (PanicUserRepo) ResolveJournalActorDisplayNames([]string) (map[string]string, error) {
	panic("unexpected")
}
func (PanicUserRepo) ShiftJournalSeesAllActivity(string, string) (bool, error) {
	panic("unexpected")
}
func (PanicUserRepo) HasUnitBranchAccess(string, string) (bool, error) {
	panic("unexpected")
}
func (PanicUserRepo) UserHasEffectiveAccess(string) (bool, error)             { panic("unexpected") }
func (PanicUserRepo) RecomputeUserIsActive(context.Context, string) error     { panic("unexpected") }
func (PanicUserRepo) Transaction(context.Context, func(*gorm.DB) error) error { panic("unexpected") }
func (PanicUserRepo) RecomputeUserIsActiveTx(*gorm.DB, string) error          { panic("unexpected") }
func (PanicUserRepo) UpdateFields(context.Context, string, map[string]interface{}) error {
	panic("unexpected")
}
func (PanicUserRepo) HasTenantSystemAdminRoleInCompany(string, string) (bool, error) {
	panic("unexpected")
}
func (PanicUserRepo) ListCompanyIDsForSupportReportTenantWideAccess(string) ([]string, error) {
	panic("unexpected")
}
func (PanicUserRepo) ListUserIDsWithTenantSystemAdminInCompany(string) ([]string, error) {
	panic("unexpected")
}
func (PanicUserRepo) UserMatchesUnitPermission(string, string, string) (bool, error) {
	panic("unexpected")
}
func (PanicUserRepo) UserMatchesAnyUnitPermission(string, string, []string) (bool, error) {
	panic("unexpected")
}
func (PanicUserRepo) UserHasUnitPermissionInCompany(string, string, string) (bool, error) {
	panic("unexpected")
}

// PanicSSORepo satisfies repository.SSORepository and panics on any call.
type PanicSSORepo struct{}

func (PanicSSORepo) GetConnectionByCompanyID(string) (*models.CompanySSOConnection, error) {
	panic("unexpected")
}
func (PanicSSORepo) UpsertConnection(*models.CompanySSOConnection) error { panic("unexpected") }
func (PanicSSORepo) FindCompaniesByEmailDomain(string) ([]models.Company, []models.CompanySSOConnection, error) {
	panic("unexpected")
}
func (PanicSSORepo) FindExternalIdentity(context.Context, string, string) (*models.UserExternalIdentity, error) {
	panic("unexpected")
}
func (PanicSSORepo) FindExternalIdentityByCompanyAndObjectID(string, string) (*models.UserExternalIdentity, error) {
	panic("unexpected")
}
func (PanicSSORepo) FindExternalIdentityByUserAndCompany(string, string) (*models.UserExternalIdentity, error) {
	panic("unexpected")
}
func (PanicSSORepo) UpdateExternalIdentity(context.Context, *models.UserExternalIdentity) error {
	panic("unexpected")
}
func (PanicSSORepo) CreateExternalIdentity(*models.UserExternalIdentity) error { panic("unexpected") }
func (PanicSSORepo) CreateExternalIdentityTx(*gorm.DB, *models.UserExternalIdentity) error {
	panic("unexpected")
}
func (PanicSSORepo) FindLoginLinkByHash(string) (*models.TenantLoginLink, error) {
	panic("unexpected")
}
func (PanicSSORepo) CreateLoginLink(*models.TenantLoginLink) error { panic("unexpected") }
func (PanicSSORepo) RevokeLoginLink(string) error                  { panic("unexpected") }
func (PanicSSORepo) InsertSSOAudit(context.Context, *models.SSOAuditEvent) error {
	panic("unexpected")
}

// SSORepoNoopAudit embeds PanicSSORepo but allows InsertSSOAudit (e.g. ExchangeFinishCode tests).
type SSORepoNoopAudit struct{ PanicSSORepo }

func (SSORepoNoopAudit) InsertSSOAudit(context.Context, *models.SSOAuditEvent) error {
	return nil
}
