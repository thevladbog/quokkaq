package services

import (
	"context"
	"errors"
	"log"
	"strings"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// ApplyPostSSOLogin updates profile from IdP and reconciles group-based access when configured.
func (s *SSOService) ApplyPostSSOLogin(
	ctx context.Context,
	company *models.Company,
	user *models.User,
	profileName, profileEmail string,
	emailVerified bool,
	groups []string,
	externalObjectID, iss, sub string,
) {
	if user == nil {
		return
	}
	_ = ctx
	u, err := s.userRepo.FindByID(user.ID)
	if err != nil {
		log.Printf("ApplyPostSSOLogin FindByID: %v", err)
		return
	}
	if extObjectID := strings.TrimSpace(externalObjectID); extObjectID != "" {
		if ext, err := s.ssoRepo.FindExternalIdentity(iss, sub); err == nil && ext != nil && ext.CompanyID == company.ID {
			if ext.ExternalObjectID == nil || strings.TrimSpace(*ext.ExternalObjectID) == "" {
				ext.ExternalObjectID = &extObjectID
				if err := s.ssoRepo.UpdateExternalIdentity(ext); err != nil {
					log.Printf("ApplyPostSSOLogin UpdateExternalIdentity oid: %v", err)
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
				other, err := s.userRepo.FindByEmail(pe)
				if errors.Is(err, gorm.ErrRecordNotFound) {
					updates["email"] = pe
				} else if err == nil && other != nil && other.ID == u.ID {
					updates["email"] = pe
				} else if err == nil && other != nil && other.ID != u.ID {
					log.Printf("ApplyPostSSOLogin: skip email update, already taken")
				} else if err != nil {
					log.Printf("ApplyPostSSOLogin FindByEmail: %v", err)
				}
			}
		}
		if len(updates) > 0 {
			if err := s.userRepo.UpdateFields(u.ID, updates); err != nil {
				log.Printf("ApplyPostSSOLogin UpdateFields: %v", err)
			}
		}
	}
	if u.ExemptFromSSOSync {
		return
	}
	if strings.TrimSpace(company.SsoAccessSource) != models.SsoAccessSourceSSOGroups {
		return
	}
	if err := s.reconcileGroupsToAccess(company, u, groups); err != nil {
		log.Printf("ApplyPostSSOLogin reconcile: %v", err)
	}
}

func (s *SSOService) reconcileGroupsToAccess(company *models.Company, user *models.User, groups []string) error {
	if s.tenantRBACRepo == nil {
		return nil
	}
	mappings, err := s.tenantRBACRepo.ListGroupMappings(company.ID)
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
			legacyWant[strings.ToLower(strings.TrimSpace(*m.LegacyRoleName))] = struct{}{}
		}
	}
	tenantIDs = dedupeStrings(tenantIDs)
	if err := s.tenantRBACRepo.ReplaceUserTenantRoles(user.ID, company.ID, tenantIDs); err != nil {
		return err
	}
	if err := s.tenantRBACRepo.SyncUserUnitsFromTenantRoles(user.ID, company.ID); err != nil {
		return err
	}
	managedLegacy := []string{"staff", "supervisor", "operator", "admin"}
	for _, name := range managedLegacy {
		want := false
		if _, ok := legacyWant[name]; ok {
			want = true
		}
		has, err := s.userHasGlobalRoleName(user.ID, name)
		if err != nil {
			return err
		}
		if want && !has {
			role, err := s.userRepo.EnsureRoleExists(name)
			if err != nil {
				return err
			}
			if err := s.userRepo.AssignRole(user.ID, role.ID); err != nil {
				return err
			}
		}
		if !want && has {
			if name == "admin" {
				continue
			}
			if err := s.userRepo.RemoveUserRoleByName(user.ID, name); err != nil {
				return err
			}
		}
	}
	if err := s.userRepo.RecomputeUserIsActive(user.ID); err != nil {
		return err
	}
	return nil
}

func (s *SSOService) userHasGlobalRoleName(userID, roleName string) (bool, error) {
	u, err := s.userRepo.FindByID(userID)
	if err != nil {
		return false, err
	}
	for _, ur := range u.Roles {
		if ur.Role.Name == roleName {
			return true, nil
		}
	}
	return false, nil
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
