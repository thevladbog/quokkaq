package services

import (
	"context"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/logger"
	"strings"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// ApplyPostSSOLogin updates profile from IdP and reconciles group-based access when configured.
// Returns an error if the user cannot be loaded or group-based RBAC reconciliation fails (caller must not issue a session).
func (s *SSOService) ApplyPostSSOLogin(
	ctx context.Context,
	company *models.Company,
	user *models.User,
	profileName, profileEmail string,
	emailVerified bool,
	groups []string,
	externalObjectID, iss, sub string,
	deferGroupReconcile bool,
) error {
	if user == nil {
		return nil
	}
	if company == nil {
		return fmt.Errorf("apply post SSO login: company is required (nil company)")
	}
	u, err := s.userRepo.FindByID(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("apply post SSO login: userRepo.FindByID(%q): %w", user.ID, err)
	}
	if extObjectID := strings.TrimSpace(externalObjectID); extObjectID != "" {
		ext, extErr := s.ssoRepo.FindExternalIdentity(ctx, iss, sub)
		if extErr != nil {
			if errors.Is(extErr, gorm.ErrRecordNotFound) {
				// No external identity row yet; nothing to backfill.
			} else {
				logger.PrintfCtx(ctx, "ApplyPostSSOLogin ssoRepo.FindExternalIdentity(issuer=%q, subject=%q): %v", iss, sub, extErr)
				return fmt.Errorf("apply post SSO login: ssoRepo.FindExternalIdentity: %w", extErr)
			}
		} else if ext != nil && ext.CompanyID == company.ID {
			if ext.ExternalObjectID == nil || strings.TrimSpace(*ext.ExternalObjectID) == "" {
				ext.ExternalObjectID = &extObjectID
				if err := s.ssoRepo.UpdateExternalIdentity(ctx, ext); err != nil {
					logger.PrintfCtx(ctx, "ApplyPostSSOLogin UpdateExternalIdentity oid: %v", err)
				}
			}
		}
	}
	if !u.SSOProfileSyncOptOut {
		updates := map[string]interface{}{}
		if pn := strings.TrimSpace(profileName); pn != "" && pn != strings.TrimSpace(u.Name) {
			updates["name"] = pn
		}
		if emailVerified && strings.TrimSpace(profileEmail) != "" {
			pe := strings.TrimSpace(strings.ToLower(profileEmail))
			cur := ""
			if u.Email != nil {
				cur = strings.ToLower(strings.TrimSpace(*u.Email))
			}
			if pe != cur {
				other, err := s.userRepo.FindByEmail(ctx, pe)
				if errors.Is(err, gorm.ErrRecordNotFound) {
					updates["email"] = pe
				} else if err == nil && other != nil && other.ID == u.ID {
					updates["email"] = pe
				} else if err == nil && other != nil && other.ID != u.ID {
					logger.PrintfCtx(ctx, "ApplyPostSSOLogin: skip email update, already taken")
				} else if err != nil {
					logger.PrintfCtx(ctx, "ApplyPostSSOLogin FindByEmail: %v", err)
				}
			}
		}
		if len(updates) > 0 {
			if err := s.userRepo.UpdateFields(ctx, u.ID, updates); err != nil {
				logger.PrintfCtx(ctx, "ApplyPostSSOLogin UpdateFields: %v", err)
			}
		}
	}
	if u.ExemptFromSSOSync {
		return nil
	}
	if strings.TrimSpace(company.SsoAccessSource) != models.SsoAccessSourceSSOGroups {
		return nil
	}
	if deferGroupReconcile {
		logger.PrintfCtx(ctx, "ApplyPostSSOLogin: skipping group reconcile (OIDC groups claim omitted due to token overage; use Graph or a later sync)")
		return nil
	}
	if err := s.reconcileGroupsToAccess(ctx, company, u, groups); err != nil {
		return fmt.Errorf("apply post SSO login: reconcile groups: %w", err)
	}
	return nil
}

// reconcileGroupsToAccess applies SSO group mappings to tenant roles and legacy roles inside one DB transaction.
// An empty groups slice means the user is not in any mapped IdP group — callers revoke mapped access.
// Do not call when the IdP omitted groups due to token overage (defer at ApplyPostSSOLogin instead).
func (s *SSOService) reconcileGroupsToAccess(ctx context.Context, company *models.Company, user *models.User, groups []string) (err error) {
	if s.tenantRBACRepo == nil {
		return nil
	}
	mappings, err := s.tenantRBACRepo.ListGroupMappings(ctx, company.ID)
	if err != nil {
		return err
	}
	groupSet := make(map[string]struct{}, len(groups))
	for _, g := range groups {
		g = strings.TrimSpace(g)
		if g != "" {
			groupSet[g] = struct{}{}
		}
	}
	var tenantIDs []string
	legacyWant := make(map[string]struct{})
	for i := range mappings {
		m := &mappings[i]
		if _, ok := groupSet[m.IdpGroupID]; !ok {
			continue
		}
		if m.TenantRoleID != nil && strings.TrimSpace(*m.TenantRoleID) != "" {
			tenantIDs = append(tenantIDs, strings.TrimSpace(*m.TenantRoleID))
		}
		if m.LegacyRoleName != nil && strings.TrimSpace(*m.LegacyRoleName) != "" {
			ln := strings.ToLower(strings.TrimSpace(*m.LegacyRoleName))
			if ln == "admin" {
				continue // SSO group mappings must not grant or revoke global admin
			}
			legacyWant[ln] = struct{}{}
		}
	}
	tenantIDs = dedupeStrings(tenantIDs)

	defer func() {
		if err != nil {
			if rerr := s.userRepo.RecomputeUserIsActive(ctx, user.ID); rerr != nil {
				logger.PrintfCtx(ctx, "reconcileGroupsToAccess: userRepo.RecomputeUserIsActive(%q) after failed tx: %v", user.ID, rerr)
			}
		}
	}()

	err = s.userRepo.Transaction(ctx, func(tx *gorm.DB) error {
		// Empty tenantIDs means IdP no longer maps this user to tenant roles — intentional deprovision; allow ReplaceUserTenantRoles to clear user_tenant_roles.
		if err := s.tenantRBACRepo.ReplaceUserTenantRolesTx(tx, user.ID, company.ID, tenantIDs, true); err != nil {
			return err
		}
		if err := s.tenantRBACRepo.SyncUserUnitsFromTenantRolesTx(tx, user.ID, company.ID); err != nil {
			return err
		}
		// Global "admin" is intentionally excluded: tenant SSO must not assign or remove platform/global admin via IdP group mappings.
		managedLegacy := []string{"staff", "supervisor", "operator"}
		roleNames, rerr := s.userRepo.ListUserRoleNamesTx(tx, user.ID)
		if rerr != nil {
			return fmt.Errorf("userRepo.ListUserRoleNamesTx: %w", rerr)
		}
		hasGlobalRole := make(map[string]bool, len(roleNames))
		for _, n := range roleNames {
			hasGlobalRole[n] = true
		}
		for _, name := range managedLegacy {
			want := false
			if _, ok := legacyWant[name]; ok {
				want = true
			}
			has := hasGlobalRole[name]
			if want && !has {
				role, terr := s.userRepo.EnsureRoleExistsTx(tx, name)
				if terr != nil {
					return fmt.Errorf("userRepo.EnsureRoleExistsTx(%q): %w", name, terr)
				}
				if err := s.userRepo.AssignRoleTx(tx, user.ID, role.ID); err != nil {
					return fmt.Errorf("userRepo.AssignRoleTx: %w", err)
				}
				hasGlobalRole[name] = true
			}
			if !want && has {
				if err := s.userRepo.RemoveUserRoleByNameTx(tx, user.ID, name); err != nil {
					return fmt.Errorf("userRepo.RemoveUserRoleByNameTx: %w", err)
				}
				hasGlobalRole[name] = false
			}
		}
		if err := s.userRepo.RecomputeUserIsActiveTx(tx, user.ID); err != nil {
			return fmt.Errorf("userRepo.RecomputeUserIsActiveTx: %w", err)
		}
		return nil
	})
	return err
}

func dedupeStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
