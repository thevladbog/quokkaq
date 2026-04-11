package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type UnitHandler struct {
	service        services.UnitService
	storageService services.StorageService
}

func NewUnitHandler(service services.UnitService, storageService services.StorageService) *UnitHandler {
	return &UnitHandler{
		service:        service,
		storageService: storageService,
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
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units [post]
func (h *UnitHandler) CreateUnit(w http.ResponseWriter, r *http.Request) {
	var unit models.Unit
	if err := json.NewDecoder(r.Body).Decode(&unit); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateUnit(&unit); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, unit)
}

// GetAllUnits godoc
// @Summary      Get all units
// @Description  Retrieves a list of all units
// @Tags         units
// @Produce      json
// @Success      200  {array}   models.Unit
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units [get]
func (h *UnitHandler) GetAllUnits(w http.ResponseWriter, r *http.Request) {
	units, err := h.service.GetAllUnits()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, units)
}

// GetUnitByID godoc
// @Summary      Get a unit by ID
// @Description  Retrieves a specific unit by its ID
// @Tags         units
// @Produce      json
// @Param        id   path      string  true  "Unit ID"
// @Success      200  {object}  models.Unit
// @Failure      404  {string}  string "Unit not found"
// @Router       /units/{id} [get]
func (h *UnitHandler) GetUnitByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	unit, err := h.service.GetUnitByID(id)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	// Kiosk config (e.g. PIN) must not be served from stale HTTP caches (desktop WebViews cache aggressively).
	w.Header().Set("Cache-Control", "no-store")
	RespondJSON(w, unit)
}

// GetUnitChildWorkplaces godoc
// @Summary      List child subdivision units
// @Description  Returns direct child units with kind subdivision (legacy path name "child-workplaces"). Empty if parent cannot have children.
// @Tags         units
// @Produce      json
// @Param        unitId path string true "Parent unit ID (subdivision or service zone)"
// @Success      200  {array}   models.Unit
// @Failure      404  {string}  string "Unit not found"
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
// @Description  Returns all direct child units (subdivision or service_zone kinds).
// @Tags         units
// @Produce      json
// @Param        unitId path string true "Parent unit ID (service zone)"
// @Success      200  {array}   models.Unit
// @Failure      404  {string}  string "Unit not found"
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var reqUnit models.Unit
	if err := json.Unmarshal(bodyBytes, &reqUnit); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Merge changes
	if reqUnit.Name != "" {
		existingUnit.Name = reqUnit.Name
	}
	if reqUnit.Code != "" {
		existingUnit.Code = reqUnit.Code
	}
	if reqUnit.Timezone != "" {
		existingUnit.Timezone = reqUnit.Timezone
	}
	if reqUnit.CompanyID != "" {
		existingUnit.CompanyID = reqUnit.CompanyID
	}
	if reqUnit.Config != nil {
		existingUnit.Config = reqUnit.Config
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, existingUnit)
}
