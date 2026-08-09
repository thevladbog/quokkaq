package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

const maxServiceRequestBodyBytes = 256 * 1024

type ServiceHandler struct {
	service  services.ServiceService
	userRepo repository.UserRepository
}

// ServiceCreateRequest documents the Service payload accepted by CreateService.
// Behavior is explicitly nullable: omission and JSON null both create no
// behavior, while an object is passed through to service-layer validation.
type ServiceCreateRequest struct {
	ID                        string                  `json:"id"`
	UnitID                    string                  `json:"unitId"`
	ParentID                  *string                 `json:"parentId,omitempty"`
	Name                      string                  `json:"name"`
	NameRu                    *string                 `json:"nameRu,omitempty"`
	NameEn                    *string                 `json:"nameEn,omitempty"`
	Description               *string                 `json:"description,omitempty"`
	DescriptionRu             *string                 `json:"descriptionRu,omitempty"`
	DescriptionEn             *string                 `json:"descriptionEn,omitempty"`
	ImageURL                  *string                 `json:"imageUrl,omitempty"`
	IconKey                   *string                 `json:"iconKey,omitempty"`
	BackgroundColor           *string                 `json:"backgroundColor,omitempty"`
	TextColor                 *string                 `json:"textColor,omitempty"`
	Prefix                    *string                 `json:"prefix,omitempty"`
	NumberSequence            *string                 `json:"numberSequence,omitempty"`
	Duration                  *int                    `json:"duration,omitempty"`
	MaxWaitingTime            *int                    `json:"maxWaitingTime,omitempty"`
	MaxServiceTime            *int                    `json:"maxServiceTime,omitempty"`
	Prebook                   bool                    `json:"prebook"`
	CalendarSlotKey           *string                 `json:"calendarSlotKey,omitempty"`
	OfferIdentification       bool                    `json:"offerIdentification"`
	IdentificationMode        string                  `json:"identificationMode"`
	KioskDocumentSettings     json.RawMessage         `json:"kioskDocumentSettings,omitempty" swaggertype:"object"`
	KioskIdentificationConfig json.RawMessage         `json:"kioskIdentificationConfig,omitempty" swaggertype:"object"`
	Behavior                  *models.ServiceBehavior `json:"behavior,omitempty" extensions:"x-nullable"`
	IsLeaf                    bool                    `json:"isLeaf"`
	RestrictedServiceZoneID   *string                 `json:"restrictedServiceZoneId,omitempty"`
	SortOrder                 int                     `json:"sortOrder"`
	GridRow                   *int                    `json:"gridRow,omitempty"`
	GridCol                   *int                    `json:"gridCol,omitempty"`
	GridRowSpan               *int                    `json:"gridRowSpan,omitempty"`
	GridColSpan               *int                    `json:"gridColSpan,omitempty"`
	Parent                    *models.Service         `json:"parent,omitempty" swaggerignore:"true"`
	Children                  []models.Service        `json:"children,omitempty"`
}

func (request ServiceCreateRequest) serviceModel() models.Service {
	return models.Service{
		ID:                        request.ID,
		UnitID:                    request.UnitID,
		ParentID:                  request.ParentID,
		Name:                      request.Name,
		NameRu:                    request.NameRu,
		NameEn:                    request.NameEn,
		Description:               request.Description,
		DescriptionRu:             request.DescriptionRu,
		DescriptionEn:             request.DescriptionEn,
		ImageUrl:                  request.ImageURL,
		IconKey:                   request.IconKey,
		BackgroundColor:           request.BackgroundColor,
		TextColor:                 request.TextColor,
		Prefix:                    request.Prefix,
		NumberSequence:            request.NumberSequence,
		Duration:                  request.Duration,
		MaxWaitingTime:            request.MaxWaitingTime,
		MaxServiceTime:            request.MaxServiceTime,
		Prebook:                   request.Prebook,
		CalendarSlotKey:           request.CalendarSlotKey,
		OfferIdentification:       request.OfferIdentification,
		IdentificationMode:        request.IdentificationMode,
		KioskDocumentSettings:     request.KioskDocumentSettings,
		KioskIdentificationConfig: request.KioskIdentificationConfig,
		Behavior:                  request.Behavior,
		IsLeaf:                    request.IsLeaf,
		RestrictedServiceZoneID:   request.RestrictedServiceZoneID,
		SortOrder:                 request.SortOrder,
		GridRow:                   request.GridRow,
		GridCol:                   request.GridCol,
		GridRowSpan:               request.GridRowSpan,
		GridColSpan:               request.GridColSpan,
		Parent:                    request.Parent,
		Children:                  request.Children,
	}
}

// ServiceUpdateRequest documents the sparse service patch accepted by
// UpdateService. Runtime merging remains in the service layer; Behavior is
// explicitly nullable so clients can distinguish omission from clearing it.
type ServiceUpdateRequest struct {
	UnitID                    *string                 `json:"unitId,omitempty"`
	ParentID                  *string                 `json:"parentId,omitempty" extensions:"x-nullable"`
	Name                      *string                 `json:"name,omitempty"`
	NameRu                    *string                 `json:"nameRu,omitempty" extensions:"x-nullable"`
	NameEn                    *string                 `json:"nameEn,omitempty" extensions:"x-nullable"`
	Description               *string                 `json:"description,omitempty" extensions:"x-nullable"`
	DescriptionRu             *string                 `json:"descriptionRu,omitempty" extensions:"x-nullable"`
	DescriptionEn             *string                 `json:"descriptionEn,omitempty" extensions:"x-nullable"`
	ImageURL                  *string                 `json:"imageUrl,omitempty" extensions:"x-nullable"`
	IconKey                   *string                 `json:"iconKey,omitempty" extensions:"x-nullable"`
	BackgroundColor           *string                 `json:"backgroundColor,omitempty" extensions:"x-nullable"`
	TextColor                 *string                 `json:"textColor,omitempty" extensions:"x-nullable"`
	Prefix                    *string                 `json:"prefix,omitempty" extensions:"x-nullable"`
	NumberSequence            *string                 `json:"numberSequence,omitempty" extensions:"x-nullable"`
	Duration                  *int                    `json:"duration,omitempty" extensions:"x-nullable"`
	MaxWaitingTime            *int                    `json:"maxWaitingTime,omitempty" extensions:"x-nullable"`
	MaxServiceTime            *int                    `json:"maxServiceTime,omitempty" extensions:"x-nullable"`
	Prebook                   *bool                   `json:"prebook,omitempty"`
	CalendarSlotKey           *string                 `json:"calendarSlotKey,omitempty" extensions:"x-nullable"`
	OfferIdentification       *bool                   `json:"offerIdentification,omitempty"`
	IdentificationMode        *string                 `json:"identificationMode,omitempty"`
	KioskDocumentSettings     *json.RawMessage        `json:"kioskDocumentSettings,omitempty" swaggertype:"object" extensions:"x-nullable"`
	KioskIdentificationConfig *json.RawMessage        `json:"kioskIdentificationConfig,omitempty" swaggertype:"object" extensions:"x-nullable"`
	Behavior                  *models.ServiceBehavior `json:"behavior,omitempty" extensions:"x-nullable"`
	IsLeaf                    *bool                   `json:"isLeaf,omitempty"`
	RestrictedServiceZoneID   *string                 `json:"restrictedServiceZoneId,omitempty" extensions:"x-nullable"`
	GridRow                   *int                    `json:"gridRow,omitempty" extensions:"x-nullable"`
	GridCol                   *int                    `json:"gridCol,omitempty" extensions:"x-nullable"`
	GridRowSpan               *int                    `json:"gridRowSpan,omitempty" extensions:"x-nullable"`
	GridColSpan               *int                    `json:"gridColSpan,omitempty" extensions:"x-nullable"`
	SortOrder                 *int                    `json:"sortOrder,omitempty"`
}

func NewServiceHandler(service services.ServiceService, userRepo repository.UserRepository) *ServiceHandler {
	return &ServiceHandler{service: service, userRepo: userRepo}
}

// CreateService godoc
// @ID           CreateService
// @Summary      Create a new service
// @Description  Creates a new service for a unit
// @Tags         services
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        service body ServiceCreateRequest true "Service Data"
// @Success      201  {object}  models.Service
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      402  {object}  handlers.QuotaExceededError "Quota Exceeded"
// @Failure      403  {string}  string "Forbidden"
// @Failure      409  {string}  string "Conflict (duplicate calendar slot key for unit)"
// @Failure      413  {string}  string "Request body too large"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /services [post]
func (h *ServiceHandler) CreateService(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	body, err := readServiceRequestBody(w, r)
	if err != nil {
		writeServiceRequestBodyError(w, err)
		return
	}
	var request ServiceCreateRequest
	if err := json.Unmarshal(body, &request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	service := request.serviceModel()
	if service.UnitID == "" {
		http.Error(w, "unitId is required", http.StatusBadRequest)
		return
	}
	allowed, err := h.userRepo.IsAdminOrHasUnitAccess(userID, service.UnitID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := h.service.CreateService(&service); err != nil {
		switch {
		case errors.Is(err, services.ErrServiceQuotaExceeded):
			writeQuotaExceeded(w, "services", err)
		case errors.Is(err, services.ErrDuplicateCalendarSlotKey):
			http.Error(w, err.Error(), http.StatusConflict)
		case repository.IsNotFound(err):
			http.Error(w, "unit not found", http.StatusBadRequest)
		case errors.Is(err, repository.ErrServiceUnitIDRequired),
			errors.Is(err, services.ErrKioskConfigRetentionOutOfRange),
			errors.Is(err, services.ErrKioskConfigRetentionRequiredWhenSensitive),
			errors.Is(err, services.ErrServiceBehaviorInvalid):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, service)
}

// GetServicesByUnit godoc
// @Summary      Get services by unit
// @Description  Retrieves all services for a specific unit
// @Tags         services
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Service
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/services [get]
func (h *ServiceHandler) GetServicesByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	services, err := h.service.GetServicesByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, services)
}

// GetServiceByID godoc
// @Summary      Get a service by ID
// @Description  Retrieves a specific service by its ID
// @Tags         services
// @Produce      json
// @Param        id   path      string  true  "Service ID"
// @Success      200  {object}  models.Service
// @Failure      404  {string}  string "Service not found"
// @Router       /services/{id} [get]
func (h *ServiceHandler) GetServiceByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	service, err := h.service.GetServiceByID(id)
	if err != nil {
		http.Error(w, "Service not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, service)
}

// UpdateService godoc
// @Summary      Update a service
// @Description  Updates an existing service
// @Tags         services
// @Accept       json
// @Produce      json
// @Param        id      path      string          true  "Service ID"
// @Param        service body      ServiceUpdateRequest  true  "Sparse or full service JSON; only sent fields are applied (grid-only updates no longer clear name/prefix)."
// @Success      200     {object}  models.Service
// @Failure      400     {string}  string "Bad Request"
// @Failure      409     {string}  string "Conflict (e.g. unit change not allowed)"
// @Failure      404     {string}  string "Not found"
// @Failure      413     {string}  string "Request body too large"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /services/{id} [put]
func (h *ServiceHandler) UpdateService(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	body, err := readServiceRequestBody(w, r)
	if err != nil {
		writeServiceRequestBodyError(w, err)
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	existing, err := h.service.GetServiceByID(id)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Service not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "UpdateService GetServiceByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	merged := *existing
	merged.Children = nil
	merged.Parent = nil
	if err := services.MergeServiceJSONPatch(&merged, raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	merged.ID = id

	if err := h.service.UpdateService(&merged); err != nil {
		if errors.Is(err, services.ErrServiceUnitImmutable) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrDuplicateCalendarSlotKey) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrKioskConfigRetentionOutOfRange) ||
			errors.Is(err, services.ErrKioskConfigRetentionRequiredWhenSensitive) ||
			errors.Is(err, services.ErrServiceBehaviorInvalid) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "Service not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, merged)
}

func readServiceRequestBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}
	return io.ReadAll(http.MaxBytesReader(w, r.Body, maxServiceRequestBodyBytes))
}

func writeServiceRequestBodyError(w http.ResponseWriter, err error) {
	if maxBytesReaderExceeded(err) {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	http.Error(w, err.Error(), http.StatusBadRequest)
}

// DeleteService godoc
// @Summary      Delete a service
// @Description  Deletes a service by its ID
// @Tags         services
// @Param        id   path      string  true  "Service ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /services/{id} [delete]
func (h *ServiceHandler) DeleteService(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteService(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
