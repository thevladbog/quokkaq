package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// maxSupportReportCreateBodyBytes caps JSON body for POST /support/reports (text + diagnostics).
const maxSupportReportCreateBodyBytes = 1 << 20 // 1 MiB

// SupportReportHandler exposes support / Plane report APIs.
type SupportReportHandler struct {
	svc *services.SupportReportService
}

// NewSupportReportHandler constructs SupportReportHandler.
func NewSupportReportHandler(svc *services.SupportReportService) *SupportReportHandler {
	return &SupportReportHandler{svc: svc}
}

// createSupportReportRequest is the JSON body for POST /support/reports.
type createSupportReportRequest struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	TraceID     string          `json:"traceId"`
	Diagnostics json.RawMessage `json:"diagnostics" swaggertype:"object"`
	UnitID      *string         `json:"unitId"`
}

// Create godoc
// @ID           createSupportReport
// @Summary      Create a support report (Plane work item)
// @Description  Creates a work item in the configured Plane project and stores a row in QuokkaQ. Requires Plane env vars on the server.
// @Tags         support
// @Accept       json
// @Produce      json
// @Param        body  body      createSupportReportRequest  true  "Report payload"
// @Success      201   {object}  models.SupportReport
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      503   {string}  string  "Plane not configured"
// @Failure      502   {string}  string  "Plane request failed"
// @Router       /support/reports [post]
// @Security     BearerAuth
func (h *SupportReportHandler) Create(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	limited := http.MaxBytesReader(w, r.Body, maxSupportReportCreateBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	var req createSupportReportRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	row, err := h.svc.Create(r.Context(), uid, services.CreateReportInput{
		Title:       req.Title,
		Description: req.Description,
		TraceID:     req.TraceID,
		Diagnostics: req.Diagnostics,
		UnitID:      req.UnitID,
	})
	if err != nil {
		if errors.Is(err, services.ErrPlaneNotConfigured) {
			http.Error(w, "Plane integration is not configured", http.StatusServiceUnavailable)
			return
		}
		if errors.Is(err, services.ErrSupportReportInvalidTitle) || errors.Is(err, services.ErrSupportReportInvalidDescription) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, "Failed to create Plane work item", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(row)
}

// List godoc
// @ID           listSupportReports
// @Summary      List support reports visible to the user
// @Description  Returns the current user's reports; tenant admins see all reports. Refreshes Plane status when older than a short interval.
// @Tags         support
// @Produce      json
// @Success      200  {array}   models.SupportReport
// @Failure      401  {string}  string  "Unauthorized"
// @Router       /support/reports [get]
// @Security     BearerAuth
func (h *SupportReportHandler) List(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.svc.List(r.Context(), uid)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []models.SupportReport{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

// GetByID godoc
// @ID           getSupportReportByID
// @Summary      Get one support report by id
// @Description  Returns a report if the current user is the author or a tenant admin. Refreshes Plane status when integration is enabled.
// @Tags         support
// @Produce      json
// @Param        id   path      string  true  "Report id"
// @Success      200  {object}  models.SupportReport
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Router       /support/reports/{id} [get]
// @Security     BearerAuth
func (h *SupportReportHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	row, err := h.svc.GetByID(r.Context(), uid, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(row)
}
