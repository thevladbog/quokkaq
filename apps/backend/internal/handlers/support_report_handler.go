package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// MaxSupportReportCreateBodyBytes caps JSON body for POST /support/reports (text + diagnostics).
const MaxSupportReportCreateBodyBytes = 1 << 20 // 1 MiB

// SupportReportHandler exposes support report APIs (Plane or Yandex Tracker).
type SupportReportHandler struct {
	svc *services.SupportReportService
}

// NewSupportReportHandler constructs SupportReportHandler.
func NewSupportReportHandler(svc *services.SupportReportService) *SupportReportHandler {
	return &SupportReportHandler{svc: svc}
}

// createSupportReportRequest is the JSON body for POST /support/reports.
// traceId is optional; when omitted or blank the server assigns a UUID.
// diagnostics is optional; when omitted the server stores an empty object.
type createSupportReportRequest struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	TraceID     string          `json:"traceId,omitempty"`
	Diagnostics json.RawMessage `json:"diagnostics,omitempty" swaggertype:"object"`
	UnitID      *string         `json:"unitId"`
}

// Create godoc
// @ID           createSupportReport
// @Summary      Create a support report (external ticket)
// @Description  Creates a ticket in the configured backend (Plane or Yandex Tracker per SUPPORT_REPORT_PLATFORM) and stores a row in QuokkaQ.
// @Tags         support
// @Accept       json
// @Produce      json
// @Param        body  body      createSupportReportRequest  true  "Report payload"
// @Success      201   {object}  models.SupportReport
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      413   {string}  string  "Payload too large"
// @Failure      500   {string}  string  "Internal server error"
// @Failure      503   {string}  string  "Integration not configured or upstream unavailable"
// @Failure      502   {string}  string  "Upstream ticket request failed"
// @Router       /support/reports [post]
// @Security     BearerAuth
func (h *SupportReportHandler) Create(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	limited := http.MaxBytesReader(w, r.Body, MaxSupportReportCreateBodyBytes)
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
	if strings.TrimSpace(req.Title) == "" {
		http.Error(w, services.ErrSupportReportInvalidTitle.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Description) == "" {
		http.Error(w, services.ErrSupportReportInvalidDescription.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Diagnostics) == 0 {
		req.Diagnostics = json.RawMessage(`{}`)
	}
	traceID := strings.TrimSpace(req.TraceID)
	if traceID == "" {
		traceID = uuid.New().String()
	}
	row, err := h.svc.Create(r.Context(), uid, services.CreateReportInput{
		Title:       req.Title,
		Description: req.Description,
		TraceID:     traceID,
		Diagnostics: req.Diagnostics,
		UnitID:      req.UnitID,
	})
	if err != nil {
		if errors.Is(err, services.ErrSupportTicketIntegrationNotConfigured) || errors.Is(err, services.ErrPlaneNotConfigured) {
			msg := "Support ticket integration is not configured"
			if hint := strings.TrimSpace(services.SupportTicketCreateEnvHint()); hint != "" {
				msg = msg + ". " + hint
			}
			http.Error(w, msg, http.StatusServiceUnavailable)
			return
		}
		if errors.Is(err, services.ErrSupportReportInvalidTitle) || errors.Is(err, services.ErrSupportReportInvalidDescription) || errors.Is(err, services.ErrSupportReportInvalidUnit) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSupportReportPersistence) {
			logger.ErrorfCtx(r.Context(), "support report Create: %v", err)
			http.Error(w, "Failed to save support report", http.StatusInternalServerError)
			return
		}
		if _, ok := services.TicketIntegrationHTTPStatus(err); ok {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report Create: upstream ticket error: %v", "Failed to create external support ticket")
			return
		}
		http.Error(w, "Failed to create external support ticket", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(row)
}

// List godoc
// @ID           listSupportReports
// @Summary      List support reports visible to the user
// @Description  Returns the current user's reports; tenant admins see all reports. Refreshes external ticket status when older than a short interval.
// @Tags         support
// @Produce      json
// @Success      200  {array}   models.SupportReport
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      500  {string}  string  "Internal server error"
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
// @Description  Returns a report if the current user is the author, a tenant admin, or has been granted a share. Refreshes external status when the row's backend client is enabled.
// @Tags         support
// @Produce      json
// @Param        id   path      string  true  "Report id"
// @Success      200  {object}  models.SupportReport
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Failure      500  {string}  string  "Internal server error"
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

// MarkIrrelevant godoc
// @ID           markSupportReportIrrelevant
// @Summary      Mark support report as not relevant
// @Description  Author or tenant admin: posts a cancel comment on the external ticket when the backend client is enabled, then stores markedIrrelevantAt on the report. Idempotent if already marked.
// @Tags         support
// @Produce      json
// @Param        id   path      string  true  "Report id"
// @Success      200  {object}  models.SupportReport
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Failure      502  {string}  string  "Failed to post comment on external ticket"
// @Failure      503  {string}  string  "External ticketing service temporarily unavailable"
// @Failure      500  {string}  string  "Internal server error"
// @Router       /support/reports/{id}/mark-irrelevant [post]
// @Security     BearerAuth
func (h *SupportReportHandler) MarkIrrelevant(w http.ResponseWriter, r *http.Request) {
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
	row, err := h.svc.MarkIrrelevant(r.Context(), uid, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportPersistence) {
			logger.ErrorfCtx(r.Context(), "support report MarkIrrelevant: %v", err)
			http.Error(w, "Failed to save support report", http.StatusInternalServerError)
			return
		}
		if _, ok := services.TicketIntegrationHTTPStatus(err); ok {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report MarkIrrelevant: upstream ticket error: %v", "Failed to post comment on external ticket")
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(row)
}

type addSupportReportShareRequest struct {
	UserID string `json:"userId"`
}

// ListShareCandidates godoc
// @ID           listSupportReportShareCandidates
// @Summary      Search users who may receive a share for this report
// @Description  Author or tenant admin only. Yandex Tracker reports only. Same company as the report author; roles admin/staff/supervisor/operator. Query q must be at least 2 characters.
// @Tags         support
// @Produce      json
// @Param        id   path      string  true   "Report id"
// @Param        q    query     string  false  "Search by name or email"
// @Success      200  {array}   repository.SupportReportShareCandidate
// @Failure      400  {string}  string  "Bad request"
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Failure      501  {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/share-candidates [get]
// @Security     BearerAuth
func (h *SupportReportHandler) ListShareCandidates(w http.ResponseWriter, r *http.Request) {
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
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := h.svc.ListSupportReportShareCandidates(r.Context(), uid, id, q)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportSharesYandexOnly) {
			http.Error(w, "Support report sharing is only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []repository.SupportReportShareCandidate{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

// ListShares godoc
// @ID           listSupportReportShares
// @Summary      List users this report is shared with
// @Description  Author or tenant admin only. Yandex Tracker reports only.
// @Tags         support
// @Produce      json
// @Param        id   path      string  true  "Report id"
// @Success      200  {array}   services.SupportReportShareListItem
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Failure      501  {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/shares [get]
// @Security     BearerAuth
func (h *SupportReportHandler) ListShares(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.svc.ListSupportReportShares(r.Context(), uid, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportSharesYandexOnly) {
			http.Error(w, "Support report sharing is only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []services.SupportReportShareListItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

// AddShare godoc
// @ID           addSupportReportShare
// @Summary      Share a support report with another user
// @Description  Author or tenant admin only. Target must be in the author's company and have support roles. Syncs Yandex Tracker apiAccessToTheTicket.
// @Tags         support
// @Accept       json
// @Produce      json
// @Param        id    path      string                        true  "Report id"
// @Param        body  body      addSupportReportShareRequest  true  "Target user id"
// @Success      200   {array}   services.SupportReportShareListItem
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      404   {string}  string  "Not found"
// @Failure      502   {string}  string  "Upstream ticket update failed"
// @Failure      503   {string}  string  "External ticketing service temporarily unavailable"
// @Failure      501   {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/shares [post]
// @Security     BearerAuth
func (h *SupportReportHandler) AddShare(w http.ResponseWriter, r *http.Request) {
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
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<14))
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	var req addSupportReportShareRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		http.Error(w, services.ErrSupportReportShareInvalidTarget.Error(), http.StatusBadRequest)
		return
	}
	rows, err := h.svc.AddSupportReportShare(r.Context(), uid, id, req.UserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportSharesYandexOnly) {
			http.Error(w, "Support report sharing is only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		if errors.Is(err, services.ErrSupportReportShareInvalidTarget) || errors.Is(err, services.ErrSupportReportShareSelf) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSupportReportPersistence) {
			logger.ErrorfCtx(r.Context(), "support report AddShare: %v", err)
			http.Error(w, "Failed to save share", http.StatusInternalServerError)
			return
		}
		if _, ok := services.TicketIntegrationHTTPStatus(err); ok {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report AddShare: upstream ticket error: %v", "Failed to update external ticket")
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []services.SupportReportShareListItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

// RemoveShare godoc
// @ID           removeSupportReportShare
// @Summary      Revoke a support report share
// @Description  Author or tenant admin only. Syncs Yandex Tracker apiAccessToTheTicket.
// @Tags         support
// @Produce      json
// @Param        id                path      string  true  "Report id"
// @Param        sharedWithUserId  path      string  true  "User id to unshare"
// @Success      200               {array}   services.SupportReportShareListItem
// @Failure      401               {string}  string  "Unauthorized"
// @Failure      403               {string}  string  "Forbidden"
// @Failure      404               {string}  string  "Not found"
// @Failure      502               {string}  string  "Upstream ticket update failed"
// @Failure      503               {string}  string  "External ticketing service temporarily unavailable"
// @Failure      501               {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/shares/{sharedWithUserId} [delete]
// @Security     BearerAuth
func (h *SupportReportHandler) RemoveShare(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	target := strings.TrimSpace(chi.URLParam(r, "sharedWithUserId"))
	if id == "" || target == "" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	rows, err := h.svc.RemoveSupportReportShare(r.Context(), uid, id, target)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportSharesYandexOnly) {
			http.Error(w, "Support report sharing is only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		if errors.Is(err, services.ErrSupportReportShareInvalidTarget) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSupportReportPersistence) {
			logger.ErrorfCtx(r.Context(), "support report RemoveShare: %v", err)
			http.Error(w, "Failed to update share", http.StatusInternalServerError)
			return
		}
		if _, ok := services.TicketIntegrationHTTPStatus(err); ok {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report RemoveShare: upstream ticket error: %v", "Failed to update external ticket")
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []services.SupportReportShareListItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

type postSupportReportCommentRequest struct {
	Text string `json:"text"`
}

// ListComments godoc
// @ID           listSupportReportComments
// @Summary      List comments on the external support ticket
// @Description  Yandex Tracker only. audience=staff (default) for full timeline; audience=applicant for public/email only (report author only).
// @Tags         support
// @Produce      json
// @Param        id        path      string  true   "Report id"
// @Param        audience  query     string  false  "staff or applicant"
// @Success      200       {array}   services.SupportReportCommentItem
// @Failure      400       {string}  string  "Bad request"
// @Failure      401       {string}  string  "Unauthorized"
// @Failure      403       {string}  string  "Forbidden"
// @Failure      404       {string}  string  "Not found"
// @Failure      502       {string}  string  "Upstream ticket request failed"
// @Failure      503       {string}  string  "External ticketing service temporarily unavailable"
// @Failure      501       {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/comments [get]
// @Security     BearerAuth
func (h *SupportReportHandler) ListComments(w http.ResponseWriter, r *http.Request) {
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
	audience := strings.TrimSpace(r.URL.Query().Get("audience"))
	rows, err := h.svc.ListSupportReportComments(r.Context(), uid, id, audience)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportInvalidAudience) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSupportReportCommentsYandexOnly) {
			http.Error(w, "Support report comments are only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		if errors.Is(err, services.ErrSupportTicketIntegrationNotConfigured) {
			http.Error(w, "Support ticket integration is not configured", http.StatusServiceUnavailable)
			return
		}
		if _, stOK := services.TicketIntegrationHTTPStatus(err); stOK {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report ListComments: upstream ticket error: %v", "Failed to load comments from external ticket")
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []services.SupportReportCommentItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(rows)
}

// PostComment godoc
// @ID           postSupportReportComment
// @Summary      Add a comment on the external support ticket
// @Description  Yandex Tracker only. Comment text is sent to Tracker as-is; public visibility for the requester is determined in Tracker.
// @Tags         support
// @Accept       json
// @Produce      json
// @Param        id    path      string                           true  "Report id"
// @Param        body  body      postSupportReportCommentRequest  true  "Comment body"
// @Success      204   "No content"
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      404   {string}  string  "Not found"
// @Failure      413   {string}  string  "Payload too large"
// @Failure      502   {string}  string  "Upstream ticket request failed"
// @Failure      503   {string}  string  "External ticketing service temporarily unavailable"
// @Failure      501   {string}  string  "Not implemented for this ticket backend"
// @Router       /support/reports/{id}/comments [post]
// @Security     BearerAuth
func (h *SupportReportHandler) PostComment(w http.ResponseWriter, r *http.Request) {
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
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	var req postSupportReportCommentRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Text) == "" {
		http.Error(w, services.ErrSupportReportInvalidDescription.Error(), http.StatusBadRequest)
		return
	}
	err = h.svc.PostSupportReportComment(r.Context(), uid, id, services.PostSupportReportCommentInput{
		Text: req.Text,
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSupportReportForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSupportReportInvalidDescription) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSupportReportCommentsYandexOnly) {
			http.Error(w, "Support report comments are only available for Yandex Tracker tickets", http.StatusNotImplemented)
			return
		}
		if errors.Is(err, services.ErrSupportTicketIntegrationNotConfigured) {
			http.Error(w, "Support ticket integration is not configured", http.StatusServiceUnavailable)
			return
		}
		if _, stOK := services.TicketIntegrationHTTPStatus(err); stOK {
			writeSupportReportUpstreamHTTPError(r.Context(), w, err, "support report PostComment: upstream ticket error: %v", "Failed to post comment on external ticket")
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
