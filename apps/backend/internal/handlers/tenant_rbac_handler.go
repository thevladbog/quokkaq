package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// TenantRBACHTTP serves tenant RBAC and SSO directory admin APIs.
type TenantRBACHTTP struct {
	tenantRBAC repository.TenantRBACRepository
	userRepo   repository.UserRepository
	sso        *services.SSOService
}

func NewTenantRBACHTTP(tr repository.TenantRBACRepository, ur repository.UserRepository, sso *services.SSOService) *TenantRBACHTTP {
	return &TenantRBACHTTP{tenantRBAC: tr, userRepo: ur, sso: sso}
}

// GetPermissionCatalog godoc
// @ID           GetPermissionCatalog
// @Summary      List global permission keys (tenant RBAC catalog)
// @Description  Returns the canonical permission strings shared by all tenants; used when defining tenant roles.
// @Tags         companies
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {array}   string
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/rbac/permissions [get]
func (h *TenantRBACHTTP) GetPermissionCatalog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rbac.All())
}

func (h *TenantRBACHTTP) actorCanAssignSystemTenantRole(actorID, companyID string) (bool, error) {
	ok, err := h.userRepo.IsPlatformAdmin(actorID)
	if err != nil || ok {
		return ok, err
	}
	ok, err = h.userRepo.IsAdmin(actorID)
	if err != nil || ok {
		return ok, err
	}
	return h.tenantRBAC.UserHasTenantSystemAdminRole(actorID, companyID)
}

func (h *TenantRBACHTTP) resolveCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	cid, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return "", false
		}
		if repository.IsNotFound(err) {
			http.Error(w, "Not found", http.StatusNotFound)
			return "", false
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return cid, true
}

func (h *TenantRBACHTTP) viewerIsGlobalAdminOrPlatformAdmin(userID string) (bool, error) {
	ok, err := h.userRepo.IsAdmin(userID)
	if err != nil || ok {
		return ok, err
	}
	return h.userRepo.IsPlatformAdmin(userID)
}

// ListGroupMappings godoc
// @ID           ListGroupMappings
// @Summary      List IdP group to role mappings
// @Description  Returns SSO group id mappings to tenant roles or legacy global role names for the current company.
// @Tags         companies
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {array}   models.CompanySSOGroupMapping
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/sso/group-mappings [get]
func (h *TenantRBACHTTP) ListGroupMappings(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rows, err := h.tenantRBAC.ListGroupMappings(r.Context(), cid)
	if err != nil {
		log.Printf("ListGroupMappings: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// UpsertGroupMappingJSON is the body for POST /companies/me/sso/group-mappings.
// Exactly one of tenantRoleId or legacyRoleName is required (see OpenAPI oneOf). For legacyRoleName,
// only staff, supervisor, and operator are accepted — the same set SSO reconciliation applies for IdP groups.
type UpsertGroupMappingJSON struct {
	IdpGroupID     string  `json:"idpGroupId"`
	TenantRoleID   *string `json:"tenantRoleId"`   // mutually exclusive with legacyRoleName
	LegacyRoleName *string `json:"legacyRoleName"` // mutually exclusive with tenantRoleId
}

// UpsertGroupMapping godoc
// @ID           UpsertGroupMapping
// @Summary      Create or update IdP group mapping
// @Description  Maps an IdP group id (e.g. Azure object id) to exactly one of: a tenant role id or legacy global role name staff | supervisor | operator. Not both; global admin is not assignable via group mapping.
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        body body UpsertGroupMappingJSON true "Mapping payload"
// @Security     BearerAuth
// @Success      201  {object}  models.CompanySSOGroupMapping "Created new mapping"
// @Success      200  {object}  models.CompanySSOGroupMapping "Updated existing mapping"
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/sso/group-mappings [post]
func (h *TenantRBACHTTP) UpsertGroupMapping(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	var body UpsertGroupMappingJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.IdpGroupID = strings.TrimSpace(body.IdpGroupID)
	if body.IdpGroupID == "" {
		http.Error(w, "idpGroupId required", http.StatusBadRequest)
		return
	}
	hasTenant := body.TenantRoleID != nil && strings.TrimSpace(*body.TenantRoleID) != ""
	hasLegacy := body.LegacyRoleName != nil && strings.TrimSpace(*body.LegacyRoleName) != ""
	if !hasTenant && !hasLegacy {
		http.Error(w, "tenantRoleId or legacyRoleName required", http.StatusBadRequest)
		return
	}
	if hasTenant && hasLegacy {
		http.Error(w, "tenantRoleId and legacyRoleName are mutually exclusive", http.StatusBadRequest)
		return
	}
	var tenantID *string
	var legacyName *string
	if hasTenant {
		t := strings.TrimSpace(*body.TenantRoleID)
		tenantID = &t
	}
	if hasLegacy {
		ln := strings.ToLower(strings.TrimSpace(*body.LegacyRoleName))
		switch ln {
		case "staff", "supervisor", "operator":
			legacyName = &ln
		default:
			http.Error(w, "legacyRoleName must be one of: staff, supervisor, operator", http.StatusBadRequest)
			return
		}
	}
	m := &models.CompanySSOGroupMapping{
		CompanyID:      cid,
		IdpGroupID:     body.IdpGroupID,
		TenantRoleID:   tenantID,
		LegacyRoleName: legacyName,
	}
	out, inserted, err := h.tenantRBAC.UpsertGroupMapping(m)
	if err != nil {
		log.Printf("UpsertGroupMapping: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if inserted {
		w.WriteHeader(http.StatusCreated)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	_ = json.NewEncoder(w).Encode(out)
}

// DeleteGroupMapping godoc
// @ID           DeleteGroupMapping
// @Summary      Delete IdP group mapping
// @Tags         companies
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        mappingId path string true "Mapping row id"
// @Security     BearerAuth
// @Success      204
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/sso/group-mappings/{mappingId} [delete]
func (h *TenantRBACHTTP) DeleteGroupMapping(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "mappingId"))
	if id == "" {
		http.Error(w, "missing mapping id", http.StatusBadRequest)
		return
	}
	if err := h.tenantRBAC.DeleteGroupMapping(cid, id); err != nil {
		log.Printf("DeleteGroupMapping: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListTenantRoles godoc
// @ID           ListTenantRoles
// @Summary      List tenant-defined roles
// @Tags         companies
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {array}   models.TenantRole
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/tenant-roles [get]
func (h *TenantRBACHTTP) ListTenantRoles(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rows, err := h.tenantRBAC.ListTenantRoles(cid)
	if err != nil {
		log.Printf("ListTenantRoles: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// TenantRoleUnitJSON is one unit grant inside a tenant role payload.
type TenantRoleUnitJSON struct {
	UnitID      string   `json:"unitId"`
	Permissions []string `json:"permissions"`
}

// CreateTenantRoleJSON is the body for POST/PATCH tenant role.
type CreateTenantRoleJSON struct {
	Name        string               `json:"name"`
	Slug        string               `json:"slug"`
	Description string               `json:"description"`
	Units       []TenantRoleUnitJSON `json:"units"`
}

// CreateTenantRole godoc
// @ID           CreateTenantRole
// @Summary      Create tenant role
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        body body CreateTenantRoleJSON true "Role definition"
// @Security     BearerAuth
// @Success      201  {object}  models.TenantRole
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/tenant-roles [post]
func (h *TenantRBACHTTP) CreateTenantRole(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	var body CreateTenantRoleJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Slug = strings.TrimSpace(body.Slug)
	if body.Name == "" || body.Slug == "" {
		http.Error(w, "name and slug required", http.StatusBadRequest)
		return
	}
	if rbac.IsSystemTenantRoleSlug(body.Slug) {
		http.Error(w, "reserved tenant role slug", http.StatusBadRequest)
		return
	}
	role := &models.TenantRole{
		CompanyID:   cid,
		Name:        body.Name,
		Slug:        body.Slug,
		Description: strings.TrimSpace(body.Description),
	}
	units := make([]models.TenantRoleUnit, 0, len(body.Units))
	for _, u := range body.Units {
		uid := strings.TrimSpace(u.UnitID)
		if uid == "" {
			continue
		}
		units = append(units, models.TenantRoleUnit{
			UnitID:      uid,
			Permissions: models.StringArray(u.Permissions),
		})
	}
	if err := h.tenantRBAC.CreateTenantRole(role, units); err != nil {
		log.Printf("CreateTenantRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out, err := h.tenantRBAC.GetTenantRole(cid, role.ID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(out)
}

// PatchTenantRole godoc
// @ID           PatchTenantRole
// @Summary      Update tenant role
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        roleId path string true "Tenant role id"
// @Param        body body CreateTenantRoleJSON true "Role definition"
// @Security     BearerAuth
// @Success      200  {object}  models.TenantRole
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/tenant-roles/{roleId} [patch]
func (h *TenantRBACHTTP) PatchTenantRole(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rid := strings.TrimSpace(chi.URLParam(r, "roleId"))
	if rid == "" {
		http.Error(w, "missing role id", http.StatusBadRequest)
		return
	}
	existing, err := h.tenantRBAC.GetTenantRole(cid, rid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("GetTenantRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var patchBody CreateTenantRoleJSON
	if err := json.NewDecoder(r.Body).Decode(&patchBody); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	role := &models.TenantRole{
		ID:          rid,
		CompanyID:   cid,
		Name:        strings.TrimSpace(patchBody.Name),
		Slug:        strings.TrimSpace(patchBody.Slug),
		Description: strings.TrimSpace(patchBody.Description),
	}
	if role.Name == "" || role.Slug == "" {
		http.Error(w, "name and slug required", http.StatusBadRequest)
		return
	}
	var units []models.TenantRoleUnit
	if rbac.IsSystemTenantRoleSlug(existing.Slug) {
		if patchBody.Slug != "" && patchBody.Slug != existing.Slug {
			http.Error(w, "cannot change reserved tenant role slug", http.StatusBadRequest)
			return
		}
		role.Slug = existing.Slug
		var ferr error
		units, ferr = h.tenantRBAC.FullTenantRoleUnitsForSystemRole(cid, rid)
		if ferr != nil {
			log.Printf("FullTenantRoleUnitsForSystemRole: %v", ferr)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	} else {
		units = make([]models.TenantRoleUnit, 0, len(patchBody.Units))
		for _, u := range patchBody.Units {
			uid := strings.TrimSpace(u.UnitID)
			if uid == "" {
				continue
			}
			units = append(units, models.TenantRoleUnit{
				UnitID:      uid,
				Permissions: models.StringArray(u.Permissions),
			})
		}
	}
	if err := h.tenantRBAC.UpdateTenantRole(role, units); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("UpdateTenantRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out, err := h.tenantRBAC.GetTenantRole(cid, rid)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// DeleteTenantRole godoc
// @ID           DeleteTenantRole
// @Summary      Delete tenant role
// @Description  Deletes a tenant-defined role. The reserved system role (`system_admin`) cannot be deleted.
// @Tags         companies
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        roleId path string true "Tenant role id"
// @Security     BearerAuth
// @Success      204
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/tenant-roles/{roleId} [delete]
func (h *TenantRBACHTTP) DeleteTenantRole(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rid := strings.TrimSpace(chi.URLParam(r, "roleId"))
	if rid == "" {
		http.Error(w, "missing role id", http.StatusBadRequest)
		return
	}
	existing, err := h.tenantRBAC.GetTenantRole(cid, rid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("GetTenantRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rbac.IsSystemTenantRoleSlug(existing.Slug) {
		http.Error(w, "cannot delete reserved tenant role", http.StatusConflict)
		return
	}
	if err := h.tenantRBAC.DeleteTenantRole(cid, rid); err != nil {
		log.Printf("DeleteTenantRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PatchUserSSOFlagsJSON updates break-glass and profile sync opt-out flags.
type PatchUserSSOFlagsJSON struct {
	// ExemptFromSSOSync when true, SSO directory reconcile does not change this user's global roles, unit assignments, or tenant role mappings (IdP group sync).
	ExemptFromSSOSync *bool `json:"exemptFromSsoSync"`
	// SSOProfileSyncOptOut when true, skip name/email updates from IdP on SSO login.
	SSOProfileSyncOptOut *bool `json:"ssoProfileSyncOptOut"`
}

// PatchUserSSOFlags godoc
// @ID           PatchUserSSOFlags
// @Summary      Patch user SSO directory flags
// @Description  Sets exemptFromSsoSync (skip IdP directory reconcile for global roles, units, and tenant role mappings) and/or ssoProfileSyncOptOut (skip name/email sync from IdP).
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        userId path string true "Target user id"
// @Param        body body PatchUserSSOFlagsJSON true "Flags"
// @Security     BearerAuth
// @Success      200  {object}  models.User
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/users/{userId}/sso-directory [patch]
func (h *TenantRBACHTTP) PatchUserSSOFlags(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	targetID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if targetID == "" {
		http.Error(w, "missing user id", http.StatusBadRequest)
		return
	}
	okAccess, err := h.userRepo.HasCompanyAccess(targetID, cid)
	if err != nil {
		log.Printf("PatchUserSSOFlags userRepo.HasCompanyAccess(%q, %q): %v", targetID, cid, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body PatchUserSSOFlagsJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	updates := map[string]interface{}{}
	if body.ExemptFromSSOSync != nil {
		updates["exempt_from_sso_sync"] = *body.ExemptFromSSOSync
	}
	if body.SSOProfileSyncOptOut != nil {
		updates["sso_profile_sync_opt_out"] = *body.SSOProfileSyncOptOut
	}
	if len(updates) == 0 {
		http.Error(w, "no fields", http.StatusBadRequest)
		return
	}
	if err := h.userRepo.UpdateFields(r.Context(), targetID, updates); err != nil {
		log.Printf("PatchUserSSOFlags: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	u, err := h.userRepo.FindByID(r.Context(), targetID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(u)
}

// PatchExternalIdentityJSON updates issuer, subject, or directory object id for SSO link.
type PatchExternalIdentityJSON struct {
	Issuer           *string `json:"issuer"`
	Subject          *string `json:"subject"`
	ExternalObjectID *string `json:"externalObjectId"`
}

// GetExternalIdentity godoc
// @ID           GetExternalIdentity
// @Summary      Get user external SSO identity
// @Description  Returns the linked OIDC issuer, subject, and optional directory object id for SSO (tenant admin).
// @Tags         companies
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        userId path string true "Target user id"
// @Security     BearerAuth
// @Success      200  {object}  models.UserExternalIdentity
// @Success      204  {string}  string "No linked external identity"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/users/{userId}/external-identity [get]
func (h *TenantRBACHTTP) GetExternalIdentity(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	targetID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if targetID == "" {
		http.Error(w, "missing user id", http.StatusBadRequest)
		return
	}
	okAccess, err := h.userRepo.HasCompanyAccess(targetID, cid)
	if err != nil {
		log.Printf("GetExternalIdentity userRepo.HasCompanyAccess(%q, %q): %v", targetID, cid, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	ext, err := h.sso.GetExternalIdentityForUser(cid, targetID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		log.Printf("GetExternalIdentity: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ext)
}

// PatchExternalIdentity godoc
// @ID           PatchExternalIdentity
// @Summary      Patch user external SSO identity
// @Description  Admin repair for issuer/subject/oid when IdP metadata or user domain changes.
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        userId path string true "Target user id"
// @Param        body body PatchExternalIdentityJSON true "Identity fields"
// @Security     BearerAuth
// @Success      200  {object}  models.UserExternalIdentity
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "external identity not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/users/{userId}/external-identity [patch]
func (h *TenantRBACHTTP) PatchExternalIdentity(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	targetID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if targetID == "" {
		http.Error(w, "missing user id", http.StatusBadRequest)
		return
	}
	okAccess, err := h.userRepo.HasCompanyAccess(targetID, cid)
	if err != nil {
		log.Printf("PatchExternalIdentity userRepo.HasCompanyAccess(%q, %q): %v", targetID, cid, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body PatchExternalIdentityJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Issuer == nil && body.Subject == nil && body.ExternalObjectID == nil {
		http.Error(w, "no fields", http.StatusBadRequest)
		return
	}
	if err := h.sso.AdminPatchExternalIdentity(cid, targetID, body.Issuer, body.Subject, body.ExternalObjectID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "external identity not found", http.StatusNotFound)
			return
		}
		log.Printf("PatchExternalIdentity: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	ext, err := h.sso.GetExternalIdentityForUser(cid, targetID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ext)
}

type companyUserListItem struct {
	models.User
	TenantRoles []TenantRoleBriefResponse `json:"tenantRoles,omitempty"`
}

// PatchUserTenantRolesJSON is the body for PATCH /companies/me/users/{userId}/tenant-roles.
type PatchUserTenantRolesJSON struct {
	TenantRoleIDs []string `json:"tenantRoleIds"`
	// ConfirmRemoveAllTenantRoles must be true when tenantRoleIds is empty after trimming, so ReplaceUserTenantRoles does not
	// clear user_tenant_roles and trigger RebuildUserUnitsFromTenantRoles mass-removal of user_units by mistake.
	ConfirmRemoveAllTenantRoles bool `json:"confirmRemoveAllTenantRoles"`
}

// PatchUserTenantRolesResponse is the JSON body for PATCH /companies/me/users/{userId}/tenant-roles 200 OK.
type PatchUserTenantRolesResponse struct {
	TenantRoles []TenantRoleBriefResponse `json:"tenantRoles"`
}

// ListCompanyUsers godoc
// @ID           ListCompanyUsers
// @Summary      List users in the current company with tenant roles
// @Description  Users are included if they have a unit in the company, a user_tenant_roles row, or are the company owner. Global admin/platform_admin users are listed only when the caller is a global admin or platform admin. Includes tenantRoles (id, name, slug) per user.
// @Tags         companies
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        search query string false "Filter by name or email (ILIKE)"
// @Security     BearerAuth
// @Success      200  {array}   companyUserListItem
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/users [get]
func (h *TenantRBACHTTP) ListCompanyUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	cid, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("ListCompanyUsers ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	includeGlobalRoleUsers, err := h.viewerIsGlobalAdminOrPlatformAdmin(userID)
	if err != nil {
		log.Printf("ListCompanyUsers viewerIsGlobalAdminOrPlatformAdmin(%q): %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	users, err := h.userRepo.ListUsersForCompany(cid, search, includeGlobalRoleUsers)
	if err != nil {
		log.Printf("ListUsersForCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	ids := make([]string, 0, len(users))
	for i := range users {
		ids = append(ids, users[i].ID)
	}
	trByUser, err := h.tenantRBAC.MapTenantRolesByUserForCompany(cid, ids)
	if err != nil {
		log.Printf("MapTenantRolesByUserForCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]companyUserListItem, 0, len(users))
	for i := range users {
		u := users[i]
		brief := make([]TenantRoleBriefResponse, 0)
		for _, tr := range trByUser[u.ID] {
			brief = append(brief, TenantRoleBriefResponse{ID: tr.ID, Name: tr.Name, Slug: tr.Slug})
		}
		out = append(out, companyUserListItem{User: u, TenantRoles: brief})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// PatchUserTenantRoles godoc
// @ID           PatchUserTenantRoles
// @Summary      Replace tenant role assignments for a user
// @Description  Sets the user’s tenant-defined roles for the company; replaces existing rows (ReplaceUserTenantRoles then SyncUserUnitsFromTenantRoles, which uses RebuildUserUnitsFromTenantRoles). Sending an empty tenantRoleIds list removes all tenant roles and unit access for this company unless confirmRemoveAllTenantRoles is true. The reserved system role (slug `system_admin`) is mutually exclusive with other tenant roles. Adding or removing that role requires the caller to be a global admin/platform admin or a tenant system administrator in this company.
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        userId path string true "Target user id"
// @Param        body body PatchUserTenantRolesJSON true "Tenant role ids"
// @Security     BearerAuth
// @Success      200  {object}  PatchUserTenantRolesResponse
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/users/{userId}/tenant-roles [patch]
func (h *TenantRBACHTTP) PatchUserTenantRoles(w http.ResponseWriter, r *http.Request) {
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	actorID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	targetID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if targetID == "" {
		http.Error(w, "missing user id", http.StatusBadRequest)
		return
	}
	okAccess, err := h.userRepo.HasCompanyAccess(targetID, cid)
	if err != nil {
		log.Printf("PatchUserTenantRoles userRepo.HasCompanyAccess(%q, %q): %v", targetID, cid, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body PatchUserTenantRolesJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	sysRole, err := h.tenantRBAC.GetTenantRoleBySlug(cid, rbac.TenantRoleSlugSystemAdmin)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "system tenant role not configured for this company", http.StatusBadRequest)
			return
		}
		log.Printf("GetTenantRoleBySlug: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	sysID := sysRole.ID
	seen := make(map[string]struct{})
	var clean []string
	for _, id := range body.TenantRoleIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		clean = append(clean, id)
	}
	if len(clean) > 0 {
		existing, err := h.tenantRBAC.ListTenantRolesByIDs(cid, clean)
		if err != nil {
			log.Printf("ListTenantRolesByIDs: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		existSet := make(map[string]struct{}, len(existing))
		for i := range existing {
			existSet[existing[i].ID] = struct{}{}
		}
		for _, id := range clean {
			if _, ok := existSet[id]; !ok {
				http.Error(w, "unknown tenant role: "+id, http.StatusBadRequest)
				return
			}
		}
	}
	var hasSysInClean bool
	for _, id := range clean {
		if id == sysID {
			hasSysInClean = true
			break
		}
	}
	if hasSysInClean && len(clean) > 1 {
		http.Error(w, "system tenant role is mutually exclusive with other tenant roles", http.StatusBadRequest)
		return
	}
	prevIDs, err := h.tenantRBAC.ListUserTenantRoleIDs(targetID, cid)
	if err != nil {
		log.Printf("ListUserTenantRoleIDs: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	prevHadSys := false
	for _, id := range prevIDs {
		if id == sysID {
			prevHadSys = true
			break
		}
	}
	if prevHadSys != hasSysInClean {
		can, err := h.actorCanAssignSystemTenantRole(actorID, cid)
		if err != nil {
			log.Printf("actorCanAssignSystemTenantRole: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !can {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}
	if len(clean) == 0 && !body.ConfirmRemoveAllTenantRoles {
		http.Error(w, "tenantRoleIds is empty: set confirmRemoveAllTenantRoles to true to remove all tenant roles and unit access for this company", http.StatusBadRequest)
		return
	}
	allowEmpty := len(clean) == 0
	if err := h.userRepo.Transaction(r.Context(), func(tx *gorm.DB) error {
		if err := h.tenantRBAC.ReplaceUserTenantRolesTx(tx, targetID, cid, clean, allowEmpty); err != nil {
			return err
		}
		if err := h.tenantRBAC.SyncUserUnitsFromTenantRolesTx(tx, targetID, cid); err != nil {
			return err
		}
		return h.userRepo.RecomputeUserIsActiveTx(tx, targetID)
	}); err != nil {
		if errors.Is(err, repository.ErrEmptyTenantRoleAssignmentNotAllowed) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Printf("PatchUserTenantRoles tx (ReplaceUserTenantRoles/SyncUserUnits/RecomputeUserIsActive): %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	trByUser, err := h.tenantRBAC.MapTenantRolesByUserForCompany(cid, []string{targetID})
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	trBrief := make([]TenantRoleBriefResponse, 0)
	for _, tr := range trByUser[targetID] {
		trBrief = append(trBrief, TenantRoleBriefResponse{ID: tr.ID, Name: tr.Name, Slug: tr.Slug})
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(PatchUserTenantRolesResponse{TenantRoles: trBrief})
}
