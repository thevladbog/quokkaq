package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"quokkaq-go-backend/internal/logger"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// maxUnitPatchBodyBytes caps PATCH /units/{id} JSON body size (DoS / memory bound).
const maxUnitPatchBodyBytes = 1 << 20 // 1 MiB

// PatchUnitKioskConfigRequest is the wire JSON for PATCH /units/{unitId}/kiosk-config: { "config": { "kiosk": { ... } } }.
// The handler merges only `config.kiosk` into the stored unit config.
type PatchUnitKioskConfigRequest struct {
	Config struct {
		Kiosk map[string]interface{} `json:"kiosk"`
	} `json:"config"`
}

type UnitHandler struct {
	service        services.UnitService
	storageService services.StorageService
	operational    *services.OperationalService
	userRepo       repository.UserRepository
}

func NewUnitHandler(service services.UnitService, storageService services.StorageService, operational *services.OperationalService, userRepo repository.UserRepository) *UnitHandler {
	return &UnitHandler{
		service:        service,
		storageService: storageService,
		operational:    operational,
		userRepo:       userRepo,
	}
}

// CreateUnit godoc
// @Summary      Create a new unit
// @Description  Creates a new unit
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        unit body models.Unit true "Unit Data"
// @Success      201  {object}  models.Unit
// @Failure      400  {string}  string "Bad Request"
// @Failure      402  {object}  object "Quota Exceeded"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units [post]
func (h *UnitHandler) CreateUnit(w http.ResponseWriter, r *http.Request) {
	var unit models.Unit
	if err := json.NewDecoder(r.Body).Decode(&unit); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateUnit(&unit); err != nil {
		switch {
		case errors.Is(err, services.ErrUnitQuotaExceeded), errors.Is(err, services.ErrZoneQuotaExceeded):
			writeQuotaExceeded(w, "", err)
		case errors.Is(err, services.ErrInvalidUnitKind), errors.Is(err, services.ErrInvalidParentKind):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, services.ErrParentNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, services.ErrCrossCompanyParent):
			http.Error(w, err.Error(), http.StatusForbidden)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, unit)
}

// GetAllUnits godoc
// @Summary      List units for the current tenant
// @Description  Returns units for the resolved company (JWT + X-Company-Id when applicable). Never returns units from other tenants.
// @Tags         units
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200  {array}   models.Unit
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units [get]
func (h *UnitHandler) GetAllUnits(w http.ResponseWriter, r *http.Request) {
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		http.Error(w, "Company context required", http.StatusBadRequest)
		return
	}
	units, err := h.service.GetUnitsForCompany(companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, units)
}

// GetUnitByID godoc
// @ID           GetUnitByID
// @Summary      Get a unit by ID
// @Description  Retrieves a specific unit by its ID
// @Tags         units
// @Produce      json
// @Param        id   path      string  true  "Unit ID"
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200  {object}  models.Unit
// @Failure      404  {string}  string "Unit not found"
// @Router       /units/{id} [get]
func (h *UnitHandler) GetUnitByID(w http.ResponseWriter, r *http.Request) {
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	unit, err := h.service.GetUnitByID(id)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	platform, err := h.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !platform {
		companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
		if err != nil {
			if errors.Is(err, repository.ErrCompanyAccessDenied) {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			http.Error(w, "Company context required", http.StatusBadRequest)
			return
		}
		if unit.CompanyID != companyID {
			http.Error(w, "Unit not found", http.StatusNotFound)
			return
		}
	}
	if h.operational != nil {
		snap, snapErr := h.operational.GetPublicSnapshot(unit.ID)
		if snapErr != nil {
			logger.PrintfCtx(r.Context(), "GetUnitByID: GetPublicSnapshot unitID=%q err=%v", unit.ID, snapErr)
		} else if snap != nil {
			unit.Operations = snap
		}
	}
	// Kiosk config (e.g. PIN) must not be served from stale HTTP caches (desktop WebViews cache aggressively).
	w.Header().Set("Cache-Control", "no-store")
	RespondJSON(w, unit)
}

// GetUnitChildWorkplaces godoc
// @Summary      List child subdivision units
// @Description  Returns direct child units with kind subdivision (legacy path name "child-workplaces"). Returns an empty array if the parent unit kind cannot have children.
// @Tags         units
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Parent unit ID (subdivision or service zone)"
// @Success      200  {array}   models.Unit
// @Failure      404  {string}  string "Unit not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/child-workplaces [get]
func (h *UnitHandler) GetUnitChildWorkplaces(w http.ResponseWriter, r *http.Request) {
	parentID := chi.URLParam(r, "unitId")
	parent, err := h.service.GetUnitByID(parentID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	if !models.UnitKindAllowsChildUnits(parent.Kind) {
		RespondJSON(w, []models.Unit{})
		return
	}
	children, err := h.service.GetChildSubdivisions(parentID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	RespondJSON(w, children)
}

// GetUnitChildUnits godoc
// @Summary      List direct child units
// @Description  Returns all direct child units (subdivision or service_zone kinds). Returns an empty array if the parent unit kind cannot have children.
// @Tags         units
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Parent unit ID (subdivision or service zone)"
// @Success      200  {array}   models.Unit
// @Failure      404  {string}  string "Unit not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/child-units [get]
func (h *UnitHandler) GetUnitChildUnits(w http.ResponseWriter, r *http.Request) {
	parentID := chi.URLParam(r, "unitId")
	parent, err := h.service.GetUnitByID(parentID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	if !models.UnitKindAllowsChildUnits(parent.Kind) {
		RespondJSON(w, []models.Unit{})
		return
	}
	children, err := h.service.GetChildUnits(parentID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	RespondJSON(w, children)
}

// DeleteUnit godoc
// @Summary      Delete a unit
// @Description  Deletes a unit by its ID
// @Tags         units
// @Param        id   path      string  true  "Unit ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{id} [delete]
func (h *UnitHandler) DeleteUnit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteUnit(id); err != nil {
		switch {
		case errors.Is(err, services.ErrUnitHasChildren):
			http.Error(w, err.Error(), http.StatusConflict)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AddMaterial godoc
// @Summary      Add material to unit
// @Description  Adds a material to a unit
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        unitId    path      string               true  "Unit ID"
// @Param        material  body      models.UnitMaterial  true  "Material Data"
// @Success      201       {object}  models.UnitMaterial
// @Failure      400       {string}  string "Bad Request"
// @Failure      500       {string}  string "Internal Server Error"
// @Router       /units/{unitId}/materials [post]
func (h *UnitHandler) AddMaterial(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")

	// Limit upload size to 50MB
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		fmt.Printf("ParseMultipartForm error: %v\n", err)
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		fmt.Printf("FormFile error: %v\n", err)
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer func() { _ = file.Close() }()

	fmt.Printf("Uploading file: %s, Size: %d\n", header.Filename, header.Size)

	// Validate file type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".svg" && ext != ".webp" && ext != ".mp4" && ext != ".webm" {
		http.Error(w, fmt.Sprintf("Invalid file type: %s. Allowed: images (jpg, png, svg, webp) and videos (mp4, webm)", ext), http.StatusBadRequest)
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	if header.Size > 0 && int64(len(fileBytes)) != header.Size {
		http.Error(w, "Uploaded file size mismatch", http.StatusBadRequest)
		return
	}

	// Upload to Storage
	url, _, err := h.storageService.UploadFile(r.Context(), fileBytes, header.Filename, "materials", header.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	// Create UnitMaterial record
	materialType := "image"
	if ext == ".mp4" || ext == ".webm" {
		materialType = "video"
	}

	material := models.UnitMaterial{
		UnitID:   unitID,
		Type:     materialType,
		URL:      url,
		Filename: header.Filename,
	}

	if err := h.service.AddMaterial(&material); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, material)
}

// GetMaterials godoc
// @Summary      Get unit materials
// @Description  Retrieves materials for a unit
// @Tags         units
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.UnitMaterial
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/materials [get]
func (h *UnitHandler) GetMaterials(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	materials, err := h.service.GetMaterials(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, materials)
}

// DeleteMaterial godoc
// @Summary      Delete material
// @Description  Deletes a material by ID
// @Tags         units
// @Param        unitId      path      string  true  "Unit ID"
// @Param        materialId  path      string  true  "Material ID"
// @Success      204         {object}  nil
// @Failure      500         {string}  string "Internal Server Error"
// @Router       /units/{unitId}/materials/{materialId} [delete]
func (h *UnitHandler) DeleteMaterial(w http.ResponseWriter, r *http.Request) {
	materialID := chi.URLParam(r, "materialId")
	if err := h.service.DeleteMaterial(materialID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateAdSettings godoc
// @Summary      Update ad settings
// @Description  Updates ad settings for a unit
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        unitId    path      string                  true  "Unit ID"
// @Param        settings  body      map[string]interface{}  true  "Ad Settings"
// @Success      200       {object}  map[string]bool
// @Failure      400       {string}  string "Bad Request"
// @Failure      500       {string}  string "Internal Server Error"
// @Router       /units/{unitId}/ad-settings [patch]
func (h *UnitHandler) UpdateAdSettings(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var settings map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.UpdateAdSettings(unitID, settings); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, map[string]bool{"success": true})
}

// PatchUnitKioskConfig godoc
// @Id           PatchUnitKioskConfig
// @Summary      Merge kiosk settings into unit config
// @Description  Body must be {"config":{"kiosk":{...}}}. Updates only config.kiosk (other config keys unchanged). Allowed for desktop terminal JWT bound to this unit, unit members, and admins.
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        unitId path      string                       true  "Unit ID"
// @Param        body   body      PatchUnitKioskConfigRequest  true  "Wrapper with config.kiosk object"
// @Success      200    {object}  models.Unit
// @Failure      400    {string}  string "Bad Request"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not found"
// @Failure      413    {string}  string "Payload too large"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/kiosk-config [patch]
func (h *UnitHandler) PatchUnitKioskConfig(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	existingUnit, err := h.service.GetUnitByID(unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}

	limited := http.MaxBytesReader(w, r.Body, maxUnitPatchBodyBytes)
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var envelope struct {
		Config map[string]json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(bodyBytes, &envelope); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if envelope.Config == nil {
		http.Error(w, "config is required", http.StatusBadRequest)
		return
	}
	kioskRaw, hasKiosk := envelope.Config["kiosk"]
	if !hasKiosk || len(kioskRaw) == 0 || string(kioskRaw) == "null" {
		http.Error(w, "config.kiosk is required", http.StatusBadRequest)
		return
	}

	var existingMap map[string]json.RawMessage
	if len(existingUnit.Config) > 0 && string(existingUnit.Config) != "null" {
		if err := json.Unmarshal(existingUnit.Config, &existingMap); err != nil {
			http.Error(w, "existing unit config is invalid", http.StatusInternalServerError)
			return
		}
	}
	if existingMap == nil {
		existingMap = make(map[string]json.RawMessage)
	}
	existingMap["kiosk"] = kioskRaw
	merged, err := json.Marshal(existingMap)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	existingUnit.Config = merged

	if err := h.service.UpdateUnit(existingUnit); err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidUnitKind), errors.Is(err, services.ErrInvalidParentKind):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, services.ErrParentNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, services.ErrCrossCompanyParent), errors.Is(err, services.ErrCycleDetected):
			http.Error(w, err.Error(), http.StatusConflict)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	RespondJSON(w, existingUnit)
}

// UpdateUnit godoc
// @Summary      Update a unit
// @Description  Updates an existing unit
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        id    path      string       true  "Unit ID"
// @Param        unit  body      models.Unit  true  "Unit Data"
// @Success      200   {object}  models.Unit
// @Failure      400   {string}  string "Bad Request"
// @Failure      404   {string}  string "Parent unit not found"
// @Failure      409   {string}  string "Conflict (cross-company parent or cycle)"
// @Failure      413   {string}  string "Request body too large"
// @Failure      500   {string}  string "Internal Server Error"
// @Router       /units/{id} [patch]
func (h *UnitHandler) UpdateUnit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Fetch existing unit
	existingUnit, err := h.service.GetUnitByID(id)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}

	limited := http.MaxBytesReader(w, r.Body, maxUnitPatchBodyBytes)
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Merge changes (single JSON parse into raw; same semantics as former reqUnit merge)
	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if s != "" {
			existingUnit.Name = s
		}
	}
	if v, ok := raw["nameEn"]; ok {
		switch string(v) {
		case "null":
			existingUnit.NameEn = nil
		default:
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			s = strings.TrimSpace(s)
			if s == "" {
				existingUnit.NameEn = nil
			} else {
				existingUnit.NameEn = &s
			}
		}
	}
	if v, ok := raw["code"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if s != "" {
			existingUnit.Code = s
		}
	}
	if v, ok := raw["timezone"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if s != "" {
			existingUnit.Timezone = s
		}
	}
	// companyId in PATCH is ignored: units cannot be moved across companies via this endpoint.
	if v, ok := raw["config"]; ok {
		if string(v) != "null" {
			var cfg json.RawMessage
			if err := json.Unmarshal(v, &cfg); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if cfg != nil {
				existingUnit.Config = cfg
			}
		}
	}

	if v, ok := raw["parentId"]; ok {
		switch string(v) {
		case "null":
			existingUnit.ParentID = nil
		default:
			var pid string
			if err := json.Unmarshal(v, &pid); err != nil {
				http.Error(w, "invalid parentId", http.StatusBadRequest)
				return
			}
			if pid == "" {
				existingUnit.ParentID = nil
			} else {
				existingUnit.ParentID = &pid
			}
		}
	}

	if v, ok := raw["kind"]; ok {
		var k string
		if err := json.Unmarshal(v, &k); err != nil {
			http.Error(w, "invalid kind", http.StatusBadRequest)
			return
		}
		if k != "" {
			existingUnit.Kind = k
		}
	}

	if v, ok := raw["sortOrder"]; ok {
		var so int
		if err := json.Unmarshal(v, &so); err != nil {
			http.Error(w, "invalid sortOrder", http.StatusBadRequest)
			return
		}
		existingUnit.SortOrder = so
	}

	if err := h.service.UpdateUnit(existingUnit); err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidUnitKind), errors.Is(err, services.ErrInvalidParentKind):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, services.ErrParentNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, services.ErrCrossCompanyParent), errors.Is(err, services.ErrCycleDetected):
			http.Error(w, err.Error(), http.StatusConflict)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	RespondJSON(w, existingUnit)
}
