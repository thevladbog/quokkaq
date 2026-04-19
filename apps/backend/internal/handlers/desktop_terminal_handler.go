package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strings"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type DesktopTerminalHandler struct {
	service services.DesktopTerminalService
}

func NewDesktopTerminalHandler(service services.DesktopTerminalService) *DesktopTerminalHandler {
	return &DesktopTerminalHandler{service: service}
}

// CreateDesktopTerminalRequest is the body for POST /desktop-terminals.
type CreateDesktopTerminalRequest struct {
	Name            *string `json:"name"`
	UnitID          string  `json:"unitId"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	// ContextUnitID: subdivision or service_zone selected in the pairing wizard (required with counterId).
	ContextUnitID *string `json:"contextUnitId"`
	CounterID     *string `json:"counterId"`
	// Kind: kiosk | counter_guest_survey | counter_board (required semantics: counter_* need counterId).
	Kind string `json:"kind"`
}

// UpdateDesktopTerminalRequest is the body for PATCH /desktop-terminals/{id}.
type UpdateDesktopTerminalRequest struct {
	Name            *string `json:"name"`
	UnitID          string  `json:"unitId"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	ContextUnitID   *string `json:"contextUnitId"`
	CounterID       *string `json:"counterId"`
	Kind            *string `json:"kind,omitempty"`
}

// CreateDesktopTerminalResponse is returned after POST /desktop-terminals.
type CreateDesktopTerminalResponse struct {
	Terminal    DesktopTerminalJSON `json:"terminal"`
	PairingCode string              `json:"pairingCode"`
}

// DesktopTerminalJSON is the wire shape for a paired desktop terminal row.
type DesktopTerminalJSON struct {
	ID              string  `json:"id"`
	UnitID          string  `json:"unitId"`
	CounterID       *string `json:"counterId,omitempty"`
	CounterName     string  `json:"counterName,omitempty"`
	Kind            string  `json:"kind"`
	Name            *string `json:"name,omitempty"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	RevokedAt       *string `json:"revokedAt,omitempty"`
	LastSeenAt      *string `json:"lastSeenAt,omitempty"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	UnitName        string  `json:"unitName,omitempty"`
}

func mapTerminalToJSON(t *models.DesktopTerminal) DesktopTerminalJSON {
	out := DesktopTerminalJSON{
		ID:              t.ID,
		UnitID:          t.UnitID,
		Kind:            models.EffectiveTerminalKind(t),
		Name:            t.Name,
		DefaultLocale:   t.DefaultLocale,
		KioskFullscreen: t.KioskFullscreen,
		CreatedAt:       t.CreatedAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt:       t.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	if t.RevokedAt != nil {
		s := t.RevokedAt.UTC().Format(time.RFC3339Nano)
		out.RevokedAt = &s
	}
	if t.LastSeenAt != nil {
		s := t.LastSeenAt.UTC().Format(time.RFC3339Nano)
		out.LastSeenAt = &s
	}
	if t.Unit.ID != "" {
		out.UnitName = models.UnitDisplayName(&t.Unit, t.DefaultLocale)
	}
	if t.CounterID != nil && *t.CounterID != "" {
		out.CounterID = t.CounterID
		if t.Counter != nil {
			out.CounterName = t.Counter.Name
		}
	}
	return out
}

// Create godoc
// @Summary      Create desktop terminal
// @Description  Admin creates a paired kiosk/counter terminal and receives a one-time pairing code.
// @Tags         DesktopTerminal
// @Accept       json
// @Produce      json
// @Param        body  body      CreateDesktopTerminalRequest  true  "Create payload"
// @Success      201   {object}  CreateDesktopTerminalResponse
// @Failure      400   {string}  string  "Bad request"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      500   {string}  string  "Internal Server Error"
// @Router       /desktop-terminals [post]
// @Security     BearerAuth
// @ID           createDesktopTerminal
func (h *DesktopTerminalHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateDesktopTerminalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.UnitID == "" || req.DefaultLocale == "" {
		http.Error(w, "unitId and defaultLocale are required", http.StatusBadRequest)
		return
	}

	row, code, err := h.service.Create(req.Name, req.UnitID, req.DefaultLocale, req.KioskFullscreen, req.ContextUnitID, req.CounterID, req.Kind)
	if err != nil {
		if errors.Is(err, services.ErrInvalidLocale) ||
			errors.Is(err, services.ErrInvalidTerminalKind) ||
			errors.Is(err, services.ErrCounterIDRequired) ||
			errors.Is(err, services.ErrInvalidKindForCounter) ||
			errors.Is(err, services.ErrTerminalCounterContext) ||
			errors.Is(err, services.ErrTerminalCounterMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSurveyFeatureLocked) {
			http.Error(w, "Counter guest survey is not enabled for your subscription", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrCounterBoardFeatureLocked) {
			http.Error(w, "Counter board is not enabled for your subscription", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrUnitNotFound) ||
			errors.Is(err, services.ErrCounterNotFound) ||
			errors.Is(err, services.ErrContextUnitNotFound) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		logger.PrintfCtx(r.Context(), "desktop terminal create: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	full := row
	if enriched, err := h.service.GetByID(row.ID); err != nil {
		logger.PrintfCtx(r.Context(), "desktop terminal get after create: %v", err)
	} else {
		full = enriched
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(CreateDesktopTerminalResponse{
		Terminal:    mapTerminalToJSON(full),
		PairingCode: code,
	})
}

// List godoc
// @Summary      List desktop terminals
// @Description  Returns every paired desktop terminal for the tenant (admin JWT). Each row includes effective `kind` (kiosk, counter_guest_survey, counter_board) and optional counter metadata.
// @Tags         DesktopTerminal
// @Produce      json
// @Success      200  {array}   DesktopTerminalJSON
// @Failure      500  {string}  string  "Internal Server Error"
// @Router       /desktop-terminals [get]
// @Security     BearerAuth
// @ID           listDesktopTerminals
func (h *DesktopTerminalHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.service.List()
	if err != nil {
		logger.PrintfCtx(r.Context(), "desktop terminal list: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]DesktopTerminalJSON, 0, len(rows))
	for i := range rows {
		out = append(out, mapTerminalToJSON(&rows[i]))
	}
	_ = json.NewEncoder(w).Encode(out)
}

// GetByID godoc
// @Summary      Get desktop terminal by ID
// @Description  Returns one terminal by id, including effective `kind` and hydrated `counterName`/`unitName` when present.
// @Tags         DesktopTerminal
// @Produce      json
// @Param        id   path      string  true  "Terminal ID"
// @Success      200  {object}  DesktopTerminalJSON
// @Failure      404  {string}  string  "Not found"
// @Failure      500  {string}  string  "Internal Server Error"
// @Router       /desktop-terminals/{id} [get]
// @Security     BearerAuth
// @ID           getDesktopTerminalByID
func (h *DesktopTerminalHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	row, err := h.service.GetByID(id)
	if middleware.RespondRepoFindError(r.Context(), w, err, "GetDesktopTerminal") {
		return
	}
	_ = json.NewEncoder(w).Encode(mapTerminalToJSON(row))
}

// Update godoc
// @Summary      Update desktop terminal
// @Description  Patches name, locale, kiosk fullscreen, and optionally counter binding. Body may include `kind` (kiosk | counter_guest_survey | counter_board) with `counterId`/`contextUnitId` when changing bindings; metadata-only updates omit counter fields.
// @Tags         DesktopTerminal
// @Accept       json
// @Produce      json
// @Param        id    path      string                      true  "Terminal ID"
// @Param        body  body      UpdateDesktopTerminalRequest  true  "Update payload"
// @Success      204   "No Content"
// @Failure      400   {string}  string  "Bad request"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      404   {string}  string  "Not found"
// @Failure      500   {string}  string  "Internal Server Error"
// @Router       /desktop-terminals/{id} [patch]
// @Security     BearerAuth
// @ID           updateDesktopTerminal
func (h *DesktopTerminalHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateDesktopTerminalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.UnitID == "" || req.DefaultLocale == "" {
		http.Error(w, "unitId and defaultLocale are required", http.StatusBadRequest)
		return
	}

	err := h.service.Update(id, req.Name, req.UnitID, req.DefaultLocale, req.KioskFullscreen, req.ContextUnitID, req.CounterID, req.Kind)
	if errors.Is(err, services.ErrInvalidLocale) ||
		errors.Is(err, services.ErrInvalidTerminalKind) ||
		errors.Is(err, services.ErrCounterIDRequired) ||
		errors.Is(err, services.ErrInvalidKindForCounter) ||
		errors.Is(err, services.ErrTerminalKindRequiresRebinding) ||
		errors.Is(err, services.ErrTerminalCounterContext) ||
		errors.Is(err, services.ErrTerminalCounterMismatch) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if errors.Is(err, services.ErrSurveyFeatureLocked) {
		http.Error(w, "Counter guest survey is not enabled for your subscription", http.StatusForbidden)
		return
	}
	if errors.Is(err, services.ErrCounterBoardFeatureLocked) {
		http.Error(w, "Counter board is not enabled for your subscription", http.StatusForbidden)
		return
	}
	if err != nil && (errors.Is(err, services.ErrUnitNotFound) ||
		errors.Is(err, services.ErrCounterNotFound) ||
		errors.Is(err, services.ErrContextUnitNotFound)) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		if middleware.RespondRepoFindError(r.Context(), w, err, "UpdateDesktopTerminal") {
			return
		}
		logger.PrintfCtx(r.Context(), "desktop terminal update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Revoke godoc
// @Summary      Revoke desktop terminal
// @Description  Marks the terminal as revoked; the pairing code stops working immediately.
// @Tags         DesktopTerminal
// @Param        id   path      string  true  "Terminal ID"
// @Success      204  "No Content"
// @Failure      404  {string}  string  "Not found"
// @Failure      500  {string}  string  "Internal Server Error"
// @Router       /desktop-terminals/{id}/revoke [post]
// @Security     BearerAuth
// @ID           revokeDesktopTerminal
func (h *DesktopTerminalHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.Revoke(id); middleware.RespondRepoFindError(r.Context(), w, err, "RevokeDesktopTerminal") {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// TerminalBootstrapRequest is the body for POST /auth/terminal/bootstrap.
type TerminalBootstrapRequest struct {
	Code string `json:"code"`
}

// TerminalBootstrapResponse is returned from POST /auth/terminal/bootstrap.
type TerminalBootstrapResponse struct {
	Token           string  `json:"token"`
	UnitID          string  `json:"unitId"`
	CounterID       *string `json:"counterId,omitempty"`
	TerminalKind    string  `json:"terminalKind"`
	DefaultLocale   string  `json:"defaultLocale"`
	AppBaseURL      string  `json:"appBaseUrl"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
}

// Bootstrap godoc
// @Summary      Bootstrap desktop terminal (pairing code exchange)
// @Description  Public: exchanges a pairing code for a terminal JWT. Response includes `terminalKind` (effective kind: kiosk, counter_guest_survey, or counter_board) and optional `counterId`. No staff session required.
// @Tags         DesktopTerminal
// @Accept       json
// @Produce      json
// @Param        body  body      TerminalBootstrapRequest  true  "Pairing code"
// @Success      200   {object}  TerminalBootstrapResponse
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      500   {string}  string  "Internal Server Error"
// @Router       /auth/terminal/bootstrap [post]
// @ID           bootstrapDesktopTerminal
func (h *DesktopTerminalHandler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	var req TerminalBootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Code) == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}

	token, unitID, loc, appBase, kioskFs, counterID, terminalKind, err := h.service.Bootstrap(req.Code)
	if err != nil {
		if errors.Is(err, services.ErrInvalidTerminalCode) {
			http.Error(w, "Invalid or revoked terminal code", http.StatusUnauthorized)
			return
		}
		logger.PrintfCtx(r.Context(), "desktop terminal bootstrap: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(TerminalBootstrapResponse{
		Token:           token,
		UnitID:          unitID,
		CounterID:       counterID,
		TerminalKind:    terminalKind,
		DefaultLocale:   loc,
		AppBaseURL:      appBase,
		KioskFullscreen: kioskFs,
	})
}
