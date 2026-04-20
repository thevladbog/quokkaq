package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type UserHandler struct {
	service         services.UserService
	userRepo        repository.UserRepository
	unitRepo        repository.UnitRepository
	deploymentSetup *services.DeploymentSetupService
	storage         services.StorageService
}

func NewUserHandler(
	service services.UserService,
	userRepo repository.UserRepository,
	unitRepo repository.UnitRepository,
	deploymentSetup *services.DeploymentSetupService,
	storage services.StorageService,
) *UserHandler {
	return &UserHandler{
		service:         service,
		userRepo:        userRepo,
		unitRepo:        unitRepo,
		deploymentSetup: deploymentSetup,
		storage:         storage,
	}
}

func (h *UserHandler) resolveViewerCompany(w http.ResponseWriter, r *http.Request) (viewerID, companyID string, ok bool) {
	userID, authOk := authmiddleware.GetUserIDFromContext(r.Context())
	if !authOk || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", "", false
	}
	cid, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, "Company context required", http.StatusBadRequest)
		}
		return "", "", false
	}
	return userID, cid, true
}

// allowUserOpOnTarget allows platform_admin always; otherwise target must belong to the resolved tenant.
func (h *UserHandler) allowUserOpOnTarget(w http.ResponseWriter, viewerID, targetUserID, companyID string) bool {
	pf, err := h.userRepo.IsPlatformAdmin(viewerID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if pf {
		return true
	}
	ok, err := h.userRepo.IsUserMemberOfCompanyTenant(targetUserID, companyID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if !ok {
		http.Error(w, "User not found", http.StatusNotFound)
		return false
	}
	return true
}

// filterUserUnitsForTenantScope trims user.Units to units in the resolved tenant when the viewer is not a platform admin (matches GetUserByID / GetUserUnits).
func (h *UserHandler) filterUserUnitsForTenantScope(viewerID, companyID string, user *models.User) error {
	pf, err := h.userRepo.IsPlatformAdmin(viewerID)
	if err != nil {
		return err
	}
	if pf || user == nil || user.Units == nil {
		return nil
	}
	filtered := user.Units[:0]
	for i := range user.Units {
		uu := user.Units[i]
		if uu.Unit.ID != "" && uu.Unit.CompanyID == companyID {
			filtered = append(filtered, uu)
		}
	}
	user.Units = filtered
	return nil
}

// CreateUser godoc
// @Summary      Create a new user
// @Description  Creates a new user with the provided details
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        user body models.User true "User Data"
// @Success      201  {object}  models.User
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users [post]
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var user models.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateUser(&user); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, user)
}

// GetAllUsers godoc
// @ID           listUsers
// @Summary      List users for the current tenant company
// @Description  Returns users belonging to the tenant company resolved from the JWT and optional X-Company-Id header.
// @Tags         users
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {array}   models.User
// @Failure      400  {string}  string "Company context required"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users [get]
func (h *UserHandler) GetAllUsers(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	search := r.URL.Query().Get("search")
	users, err := h.service.ListUsersForCompany(companyID, search, false)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, users)
}

// GetUserByID godoc
// @ID           getUserByID
// @Summary      Get a user by ID
// @Description  Retrieves a specific user by their ID
// @Tags         users
// @Produce      json
// @Param        id   path      string  true  "User ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {object}  models.User
// @Failure      400  {string}  string "Company context required"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "User not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users/{id} [get]
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	if err := h.filterUserUnitsForTenantScope(viewerID, companyID, user); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, user)
}

// DeleteUser godoc
// @ID           deleteUser
// @Summary      Delete a user
// @Description  Deletes a user by their ID
// @Tags         users
// @Param        id   path      string  true  "User ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      204  {object}  nil
// @Failure      400  {string}  string "Company context required"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "User not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users/{id} [delete]
func (h *UserHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	if err := h.service.DeleteUser(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateUser godoc
// @ID           updateUser
// @Summary      Update a user
// @Description  Partially updates an existing user — fields provided in the JSON body are merged into the existing user; omitted keys are left unchanged.
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id   path   string                  true  "User ID"
// @Param        user body   models.UpdateUserInput  true  "User Data"
// @Success      200   {object}  models.User
// @Failure      400   {string}  string "Bad Request"
// @Failure      404   {string}  string "User not found"
// @Failure      500   {string}  string "Internal Server Error"
// @Router       /users/{id} [patch]
func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	var input models.UpdateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.UpdateUser(id, &input); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrUpdateUserEmptyInput) || errors.Is(err, services.ErrUpdateUserNameEmpty) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err := h.filterUserUnitsForTenantScope(viewerID, companyID, user); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, user)
}

type AssignUnitRequest struct {
	UnitID      string   `json:"unitId"`
	Permissions []string `json:"permissions"`
}

// AssignUnit godoc
// @ID           assignUserUnit
// @Summary      Assign unit to user
// @Description  Assigns a unit to a user with optional permissions
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id       path      string             true  "User ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        request  body      AssignUnitRequest  true  "Assign Request"
// @Security     BearerAuth
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string "Bad Request"
// @Failure      401      {string}  string "Unauthorized"
// @Failure      403      {string}  string "Forbidden"
// @Failure      404      {string}  string "Not found"
// @Failure      500      {string}  string "Internal Server Error"
// @Router       /users/{id}/units/assign [post]
func (h *UserHandler) AssignUnit(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	var req AssignUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	un, err := h.unitRepo.FindByIDLight(req.UnitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unit not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if un.CompanyID != companyID {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}

	if err := h.service.AssignUnit(id, req.UnitID, req.Permissions); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, map[string]bool{"success": true})
}

type RemoveUnitRequest struct {
	UnitID string `json:"unitId"`
}

// RemoveUnit godoc
// @ID           removeUserUnit
// @Summary      Remove unit from user
// @Description  Removes a unit from a user
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id       path      string             true  "User ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        request  body      RemoveUnitRequest  true  "Remove Request"
// @Security     BearerAuth
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string "Bad Request"
// @Failure      401      {string}  string "Unauthorized"
// @Failure      403      {string}  string "Forbidden"
// @Failure      404      {string}  string "Not found"
// @Failure      500      {string}  string "Internal Server Error"
// @Router       /users/{id}/units/remove [post]
func (h *UserHandler) RemoveUnit(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	var req RemoveUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	un, err := h.unitRepo.FindByIDLight(req.UnitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unit not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if un.CompanyID != companyID {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}

	if err := h.service.RemoveUnit(id, req.UnitID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, map[string]bool{"success": true})
}

// GetUserUnits godoc
// @ID           getUserUnits
// @Summary      Get user units
// @Description  Retrieves units assigned to a user
// @Tags         users
// @Produce      json
// @Param        id   path      string  true  "User ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {array}   models.Unit
// @Failure      400  {string}  string "Company context required"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "User not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users/{id}/units [get]
func (h *UserHandler) GetUserUnits(w http.ResponseWriter, r *http.Request) {
	viewerID, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !h.allowUserOpOnTarget(w, viewerID, id, companyID) {
		return
	}
	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err := h.filterUserUnitsForTenantScope(viewerID, companyID, user); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, user.Units)
}

// GetSystemStatus godoc
// @Summary      Get system status
// @Description  True when SaaS deployment bootstrap is complete (SaaS operator company + at least one platform_admin).
// @Tags         system
// @Produce      json
// @Success      200  {object}  map[string]bool
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /system/status [get]
func (h *UserHandler) GetSystemStatus(w http.ResponseWriter, r *http.Request) {
	initialized, err := h.service.IsSystemInitialized()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, map[string]bool{
		"initialized":     initialized,
		"deploymentReady": initialized,
	})
}

// GetSystemHealth godoc
// @ID           getSystemHealth
// @Summary      Setup wizard health checks
// @Description  Probes PostgreSQL, Redis, S3, and SMTP. Requires X-Setup-Token when APP_ENV is production or staging and SETUP_TOKEN is set.
// @Tags         system
// @Produce      json
// @Success      200  {object}  services.SetupHealthReport
// @Failure      401  {object}  map[string]string
// @Failure      503  {object}  map[string]string
// @Router       /system/health [get]
func (h *UserHandler) GetSystemHealth(w http.ResponseWriter, r *http.Request) {
	report := services.CollectSetupHealth(r.Context(), h.storage)
	RespondJSON(w, report)
}

type setupFirstAdminRequest struct {
	CompanyName string `json:"companyName"`
	UnitName    string `json:"unitName"`
	Timezone    string `json:"timezone"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
}

// SetupFirstAdmin godoc
// @ID           setupFirstAdmin
// @Summary      SaaS first deployment bootstrap
// @Description  Creates SaaS operator company, root unit, anonymous kiosk client, and first admin with admin + platform_admin roles.
// @Tags         system
// @Accept       json
// @Produce      json
// @Param        request body setupFirstAdminRequest true "Bootstrap payload"
// @Success      201  {object}  models.User
// @Failure      400  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /system/setup [post]
func (h *UserHandler) SetupFirstAdmin(w http.ResponseWriter, r *http.Request) {
	var req setupFirstAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondJSONWithStatus(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" || req.CompanyName == "" {
		RespondJSONWithStatus(w, http.StatusBadRequest, map[string]string{"error": "companyName, name, email and password are required"})
		return
	}
	email := req.Email
	in := services.BootstrapSaaSInput{
		CompanyName: req.CompanyName,
		UnitName:    req.UnitName,
		Timezone:    req.Timezone,
		AdminName:   req.Name,
		AdminEmail:  email,
		AdminPass:   req.Password,
	}

	if err := h.deploymentSetup.BootstrapSaaS(context.Background(), in); err != nil {
		if errors.Is(err, services.ErrDeploymentAlreadyReady) {
			RespondJSONWithStatus(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, services.ErrBootstrapValidation) {
			RespondJSONWithStatus(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		RespondJSONWithStatus(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	user, err := h.userRepo.FindByEmail(r.Context(), email)
	if err != nil || user == nil {
		RespondJSONWithStatus(w, http.StatusInternalServerError, map[string]string{"error": "user was created but could not be loaded"})
		return
	}
	user.Password = nil
	RespondJSONWithStatus(w, http.StatusCreated, user)
}
