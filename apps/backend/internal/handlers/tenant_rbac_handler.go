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

// ListGroupMappings godoc
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
	rows, err := h.tenantRBAC.ListGroupMappings(cid)
	if err != nil {
		log.Printf("ListGroupMappings: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// UpsertGroupMappingJSON is the body for POST /companies/me/sso/group-mappings.
type UpsertGroupMappingJSON struct {
	IdpGroupID     string  `json:"idpGroupId"`
	TenantRoleID   *string `json:"tenantRoleId"`
	LegacyRoleName *string `json:"legacyRoleName"`
}

// UpsertGroupMapping godoc
// @Summary      Create or update IdP group mapping
// @Description  Maps an IdP group id (e.g. Azure object id) to a tenant role and/or a legacy role name (staff, supervisor, ...).
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        body body UpsertGroupMappingJSON true "Mapping payload"
// @Security     BearerAuth
// @Success      201  {object}  models.CompanySSOGroupMapping
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
	m := &models.CompanySSOGroupMapping{
		CompanyID:      cid,
		IdpGroupID:     body.IdpGroupID,
		TenantRoleID:   body.TenantRoleID,
		LegacyRoleName: body.LegacyRoleName,
	}
	if err := h.tenantRBAC.UpsertGroupMapping(m); err != nil {
		log.Printf("UpsertGroupMapping: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	rows, err := h.tenantRBAC.ListGroupMappings(cid)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var out *models.CompanySSOGroupMapping
	for i := range rows {
		if rows[i].IdpGroupID == body.IdpGroupID {
			out = &rows[i]
			break
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(out)
}

// DeleteGroupMapping godoc
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
	ExemptFromSSOSync    *bool `json:"exemptFromSsoSync"`
	SSOProfileSyncOptOut *bool `json:"ssoProfileSyncOptOut"`
}

// PatchUserSSOFlags godoc
// @Summary      Patch user SSO directory flags
// @Description  Sets exemptFromSsoSync (skip group reconcile) and/or ssoProfileSyncOptOut (skip name/email sync from IdP).
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
	if err != nil || !okAccess {
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
	if err := h.userRepo.UpdateFields(targetID, updates); err != nil {
		log.Printf("PatchUserSSOFlags: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	u, err := h.userRepo.FindByID(targetID)
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

// PatchExternalIdentity godoc
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
	if err != nil || !okAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body PatchExternalIdentityJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
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

type tenantRoleBrief struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type companyUserListItem struct {
	models.User
	TenantRoles []tenantRoleBrief `json:"tenantRoles,omitempty"`
}

// PatchUserTenantRolesJSON is the body for PATCH /companies/me/users/{userId}/tenant-roles.
type PatchUserTenantRolesJSON struct {
	TenantRoleIDs []string `json:"tenantRoleIds"`
}

// ListCompanyUsers godoc
// @Summary      List users in the current company with tenant roles
// @Description  Users are included if they have a unit in the company, a user_tenant_roles row, global admin/platform_admin, or are the company owner. Includes tenantRoles (id, name, slug) per user.
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
	cid, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	users, err := h.userRepo.ListUsersForCompany(cid, search)
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
		brief := make([]tenantRoleBrief, 0)
		for _, tr := range trByUser[u.ID] {
			brief = append(brief, tenantRoleBrief{ID: tr.ID, Name: tr.Name, Slug: tr.Slug})
		}
		out = append(out, companyUserListItem{User: u, TenantRoles: brief})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// PatchUserTenantRoles godoc
// @Summary      Replace tenant role assignments for a user
// @Description  Sets the user’s tenant-defined roles for the company; replaces existing rows. Rebuilds user_units from role grants. The reserved system role (slug `system_admin`) is mutually exclusive with other tenant roles. Adding or removing that role requires the caller to be a global admin/platform admin or a tenant system administrator in this company.
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        userId path string true "Target user id"
// @Param        body body PatchUserTenantRolesJSON true "Tenant role ids"
// @Security     BearerAuth
// @Success      200  {object}  map[string][]tenantRoleBrief
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
	if err != nil || !okAccess {
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
		if _, err := h.tenantRBAC.GetTenantRole(cid, id); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "unknown tenant role: "+id, http.StatusBadRequest)
				return
			}
			log.Printf("GetTenantRole: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		clean = append(clean, id)
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
	if err := h.tenantRBAC.ReplaceUserTenantRoles(targetID, cid, clean); err != nil {
		log.Printf("ReplaceUserTenantRoles: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.tenantRBAC.SyncUserUnitsFromTenantRoles(targetID, cid); err != nil {
		log.Printf("SyncUserUnitsFromTenantRoles: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.userRepo.RecomputeUserIsActive(targetID); err != nil {
		log.Printf("RecomputeUserIsActive: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	trByUser, err := h.tenantRBAC.MapTenantRolesByUserForCompany(cid, []string{targetID})
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	trBrief := make([]tenantRoleBrief, 0)
	for _, tr := range trByUser[targetID] {
		trBrief = append(trBrief, tenantRoleBrief{ID: tr.ID, Name: tr.Name, Slug: tr.Slug})
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string][]tenantRoleBrief{"tenantRoles": trBrief})
}
