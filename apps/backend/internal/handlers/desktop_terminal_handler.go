package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
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

type createDesktopTerminalRequest struct {
	Name            *string `json:"name"`
	UnitID          string  `json:"unitId"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	// ContextUnitID: subdivision or service_zone selected in the pairing wizard (required with counterId).
	ContextUnitID *string `json:"contextUnitId"`
	CounterID     *string `json:"counterId"`
}

type updateDesktopTerminalRequest struct {
	Name            *string `json:"name"`
	UnitID          string  `json:"unitId"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	ContextUnitID   *string `json:"contextUnitId"`
	CounterID       *string `json:"counterId"`
}

type createDesktopTerminalResponse struct {
	Terminal    desktopTerminalJSON `json:"terminal"`
	PairingCode string              `json:"pairingCode"`
}

type desktopTerminalJSON struct {
	ID              string  `json:"id"`
	UnitID          string  `json:"unitId"`
	CounterID       *string `json:"counterId,omitempty"`
	CounterName     string  `json:"counterName,omitempty"`
	Name            *string `json:"name,omitempty"`
	DefaultLocale   string  `json:"defaultLocale"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
	RevokedAt       *string `json:"revokedAt,omitempty"`
	LastSeenAt      *string `json:"lastSeenAt,omitempty"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	UnitName        string  `json:"unitName,omitempty"`
}

func mapTerminalToJSON(t *models.DesktopTerminal) desktopTerminalJSON {
	out := desktopTerminalJSON{
		ID:              t.ID,
		UnitID:          t.UnitID,
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
		out.UnitName = t.Unit.Name
	}
	if t.CounterID != nil && *t.CounterID != "" {
		out.CounterID = t.CounterID
		if t.Counter != nil {
			out.CounterName = t.Counter.Name
		}
	}
	return out
}

func (h *DesktopTerminalHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createDesktopTerminalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.UnitID == "" || req.DefaultLocale == "" {
		http.Error(w, "unitId and defaultLocale are required", http.StatusBadRequest)
		return
	}

	row, code, err := h.service.Create(req.Name, req.UnitID, req.DefaultLocale, req.KioskFullscreen, req.ContextUnitID, req.CounterID)
	if err != nil {
		if errors.Is(err, services.ErrInvalidLocale) ||
			errors.Is(err, services.ErrTerminalCounterContext) ||
			errors.Is(err, services.ErrTerminalCounterMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSurveyFeatureLocked) {
			http.Error(w, "Counter guest survey is not enabled for your subscription", http.StatusForbidden)
			return
		}
		if err.Error() == "unit not found" || err.Error() == "counter not found" || err.Error() == "context unit not found" {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	full, err := h.service.GetByID(row.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(createDesktopTerminalResponse{
		Terminal:    mapTerminalToJSON(full),
		PairingCode: code,
	})
}

func (h *DesktopTerminalHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.service.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]desktopTerminalJSON, 0, len(rows))
	for i := range rows {
		out = append(out, mapTerminalToJSON(&rows[i]))
	}
	_ = json.NewEncoder(w).Encode(out)
}

func (h *DesktopTerminalHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	row, err := h.service.GetByID(id)
	if middleware.RespondRepoFindError(w, err, "GetDesktopTerminal") {
		return
	}
	_ = json.NewEncoder(w).Encode(mapTerminalToJSON(row))
}

func (h *DesktopTerminalHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateDesktopTerminalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.UnitID == "" || req.DefaultLocale == "" {
		http.Error(w, "unitId and defaultLocale are required", http.StatusBadRequest)
		return
	}

	err := h.service.Update(id, req.Name, req.UnitID, req.DefaultLocale, req.KioskFullscreen, req.ContextUnitID, req.CounterID)
	if errors.Is(err, services.ErrInvalidLocale) ||
		errors.Is(err, services.ErrTerminalCounterContext) ||
		errors.Is(err, services.ErrTerminalCounterMismatch) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if errors.Is(err, services.ErrSurveyFeatureLocked) {
		http.Error(w, "Counter guest survey is not enabled for your subscription", http.StatusForbidden)
		return
	}
	if err != nil && (err.Error() == "unit not found" || err.Error() == "counter not found" || err.Error() == "context unit not found") {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		if middleware.RespondRepoFindError(w, err, "UpdateDesktopTerminal") {
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DesktopTerminalHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.Revoke(id); middleware.RespondRepoFindError(w, err, "RevokeDesktopTerminal") {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type terminalBootstrapRequest struct {
	Code string `json:"code"`
}

type terminalBootstrapResponse struct {
	Token           string  `json:"token"`
	UnitID          string  `json:"unitId"`
	CounterID       *string `json:"counterId,omitempty"`
	DefaultLocale   string  `json:"defaultLocale"`
	AppBaseURL      string  `json:"appBaseUrl"`
	KioskFullscreen bool    `json:"kioskFullscreen"`
}

func (h *DesktopTerminalHandler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	var req terminalBootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Code) == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}

	token, unitID, loc, appBase, kioskFs, counterID, err := h.service.Bootstrap(req.Code)
	if err != nil {
		if errors.Is(err, services.ErrInvalidTerminalCode) {
			http.Error(w, "Invalid or revoked terminal code", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(terminalBootstrapResponse{
		Token:           token,
		UnitID:          unitID,
		CounterID:       counterID,
		DefaultLocale:   loc,
		AppBaseURL:      appBase,
		KioskFullscreen: kioskFs,
	})
}
