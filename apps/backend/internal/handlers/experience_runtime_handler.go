package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type terminalExperienceRuntimeService interface {
	ResolveTerminalExperience(context.Context, string) (*services.TerminalExperienceManifest, error)
	AcknowledgeTerminalExperience(context.Context, string, string, string, *string) error
}

const terminalExperienceAckMaxBytes int64 = 4 << 10

var terminalExperienceReasonCodePattern = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`)

// ExperienceRuntimeHandler serves the currently published experience to its
// authenticated desktop terminal.
type ExperienceRuntimeHandler struct {
	service terminalExperienceRuntimeService
}

func NewExperienceRuntimeHandler(service terminalExperienceRuntimeService) *ExperienceRuntimeHandler {
	return &ExperienceRuntimeHandler{service: service}
}

// RegisterTerminalExperienceRoutes keeps runtime manifests outside user and
// company route groups. The handler additionally rejects non-terminal JWTs.
func RegisterTerminalExperienceRoutes(router chi.Router, handler *ExperienceRuntimeHandler) {
	router.Route("/terminal/experience", func(r chi.Router) {
		r.Use(middleware.JWTAuth)
		r.Get("/", handler.Manifest)
		r.Post("/ack", handler.Acknowledge)
	})
}

func terminalExperienceSubject(r *http.Request) (string, bool) {
	tokenType, _ := r.Context().Value(middleware.TokenTypeKey).(string)
	terminalID, ok := middleware.GetUserIDFromContext(r.Context())
	return terminalID, ok && tokenType == "terminal" && terminalID != ""
}

func respondTerminalExperienceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	case errors.Is(err, repository.ErrExperienceAcknowledgementVersionNotCurrent):
		http.Error(w, "Experience version is not current", http.StatusConflict)
	case errors.Is(err, services.ErrExperienceTemplateUnpublished),
		errors.Is(err, services.ErrExperiencePublishedDefinitionInvalid),
		errors.Is(err, services.ErrExperienceVariantNotFound),
		errors.Is(err, services.ErrExperienceAssignmentIncomplete),
		errors.Is(err, services.ErrExperienceAssignmentIncompatible):
		http.Error(w, "Experience assignment is unavailable", http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "terminal experience runtime", "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// Manifest godoc
// @ID           GetTerminalExperienceManifest
// @Summary      Get the terminal experience manifest
// @Description  Returns legacy mode when no experience is assigned, otherwise the terminal's current immutable published experience. The terminal identity always comes from the terminal JWT subject.
// @Tags         DesktopTerminal
// @Produce      json
// @Success      200 {object} services.TerminalExperienceManifest
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      409 {string} string "Current assignment is unavailable"
// @Failure      500 {string} string "Internal server error"
// @Router       /terminal/experience [get]
// @Security     BearerAuth
func (h *ExperienceRuntimeHandler) Manifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	terminalID, ok := terminalExperienceSubject(r)
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	manifest, err := h.service.ResolveTerminalExperience(r.Context(), terminalID)
	if err != nil {
		respondTerminalExperienceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(manifest)
}

// TerminalExperienceAckRequest is the terminal's bounded deployment result.
// Terminal identity is always derived from the authenticated terminal JWT.
type TerminalExperienceAckRequest struct {
	VersionID  string  `json:"versionId" binding:"required"`
	Status     string  `json:"status" enums:"applied,rejected"`
	ReasonCode *string `json:"reasonCode,omitempty" maxLength:"64" example:"renderer.timeout"`
}

func decodeTerminalExperienceAck(w http.ResponseWriter, r *http.Request) (TerminalExperienceAckRequest, error) {
	var request TerminalExperienceAckRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, terminalExperienceAckMaxBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return TerminalExperienceAckRequest{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return TerminalExperienceAckRequest{}, errUnexpectedTerminalExperienceAckJSON
		}
		return TerminalExperienceAckRequest{}, err
	}
	request.VersionID = strings.TrimSpace(request.VersionID)
	request.Status = strings.TrimSpace(request.Status)
	if request.ReasonCode != nil {
		reasonCode := strings.TrimSpace(*request.ReasonCode)
		request.ReasonCode = &reasonCode
	}
	return request, nil
}

var errUnexpectedTerminalExperienceAckJSON = &terminalExperienceAckJSONError{}

type terminalExperienceAckJSONError struct{}

func (*terminalExperienceAckJSONError) Error() string { return "multiple JSON values" }

func validTerminalExperienceAck(request TerminalExperienceAckRequest) bool {
	if request.VersionID == "" {
		return false
	}
	switch request.Status {
	case "applied":
		return request.ReasonCode == nil
	case "rejected":
		return request.ReasonCode != nil && len(*request.ReasonCode) <= 64 && terminalExperienceReasonCodePattern.MatchString(*request.ReasonCode)
	default:
		return false
	}
}

// Acknowledge godoc
// @ID           AcknowledgeTerminalExperienceManifest
// @Summary      Acknowledge the terminal experience manifest
// @Description  Records whether the authenticated terminal applied or rejected its currently published assigned version. Rejected deployments require a bounded machine-readable reasonCode and preserve the last successfully applied version; applied deployments forbid one.
// @Tags         DesktopTerminal
// @Accept       json
// @Produce      json
// @Param        body body TerminalExperienceAckRequest true "Acknowledgement payload"
// @Success      204
// @Failure      400 {string} string "Invalid acknowledgement payload"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      409 {string} string "Version is not currently assigned and published"
// @Failure      500 {string} string "Internal server error"
// @Router       /terminal/experience/ack [post]
// @Security     BearerAuth
func (h *ExperienceRuntimeHandler) Acknowledge(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	terminalID, ok := terminalExperienceSubject(r)
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	request, err := decodeTerminalExperienceAck(w, r)
	if err != nil || !validTerminalExperienceAck(request) {
		http.Error(w, "Invalid acknowledgement payload", http.StatusBadRequest)
		return
	}
	if err := h.service.AcknowledgeTerminalExperience(r.Context(), terminalID, request.VersionID, request.Status, request.ReasonCode); err != nil {
		respondTerminalExperienceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
