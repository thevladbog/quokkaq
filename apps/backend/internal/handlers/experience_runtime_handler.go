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
	"time"

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

const terminalExperienceReasonCodePatternText = `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`

var terminalExperienceReasonCodePattern = regexp.MustCompile(terminalExperienceReasonCodePatternText)

// ExperienceRuntimeHandler serves the currently published experience to its
// authenticated desktop terminal.
type ExperienceRuntimeHandler struct {
	service terminalExperienceRuntimeService
}

// LegacyManifest is the exact no-assignment terminal manifest.
type LegacyManifest struct {
	Mode string `json:"mode" binding:"required" enums:"legacy"`
}

// ExperienceManifest is the exact immutable published deployment manifest.
type ExperienceManifest struct {
	Mode        string          `json:"mode" binding:"required" enums:"experience"`
	TemplateID  string          `json:"templateId" binding:"required"`
	VersionID   string          `json:"versionId" binding:"required"`
	Version     int             `json:"version" binding:"required"`
	VariantID   string          `json:"variantId" binding:"required"`
	Definition  json.RawMessage `json:"definition" binding:"required" swaggertype:"object"`
	PublishedAt time.Time       `json:"publishedAt" binding:"required"`
}

// TerminalExperienceManifestResponseDoc carries both Swagger 2 source
// variants. swagger-to-openapi3 replaces this carrier with a mode-discriminated
// oneOf before the final OpenAPI 3 artifact is emitted.
type TerminalExperienceManifestResponseDoc struct {
	Legacy     LegacyManifest     `json:"legacy,omitempty"`
	Experience ExperienceManifest `json:"experience,omitempty"`
}

// AppliedExperienceAcknowledgement is the applied acknowledgement variant.
type AppliedExperienceAcknowledgement struct {
	VersionID string `json:"versionId" binding:"required" minLength:"1"`
	Status    string `json:"status" binding:"required" enums:"applied"`
}

// RejectedExperienceAcknowledgement is the rejected acknowledgement variant.
type RejectedExperienceAcknowledgement struct {
	VersionID  string `json:"versionId" binding:"required" minLength:"1"`
	Status     string `json:"status" binding:"required" enums:"rejected"`
	ReasonCode string `json:"reasonCode" binding:"required" minLength:"1" maxLength:"64" pattern:"^[a-z0-9]+(?:[._-][a-z0-9]+)*$" example:"renderer.timeout"`
}

// TerminalExperienceAckRequestDoc carries Swagger 2 source variants. The
// converter rewrites it to a strict status-discriminated OpenAPI 3 oneOf.
type TerminalExperienceAckRequestDoc struct {
	Applied  AppliedExperienceAcknowledgement  `json:"applied,omitempty"`
	Rejected RejectedExperienceAcknowledgement `json:"rejected,omitempty"`
}

func NewExperienceRuntimeHandler(service terminalExperienceRuntimeService) *ExperienceRuntimeHandler {
	return &ExperienceRuntimeHandler{service: service}
}

// RegisterTerminalExperienceRoutes keeps runtime manifests outside user and
// company route groups. The handler additionally rejects non-terminal JWTs.
func RegisterTerminalExperienceRoutes(router chi.Router, handler *ExperienceRuntimeHandler) {
	router.Route("/terminal/experience", func(r chi.Router) {
		// Keep this middleware chain on the two deployment endpoints rather than
		// their whole route group: unrelated paths and unsupported methods must
		// not inherit a deployment-specific cache directive.
		r.With(terminalExperienceNoStore, middleware.JWTAuth).Get("/", handler.Manifest)
		r.With(terminalExperienceNoStore, middleware.JWTAuth).Post("/ack", handler.Acknowledge)
	})
}

// terminalExperienceNoStore is intentionally attached only to the terminal
// deployment protocol so JWT denials cannot leave sensitive manifests cached.
func terminalExperienceNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func terminalExperienceSubject(r *http.Request) (string, bool) {
	tokenType, _ := r.Context().Value(middleware.TokenTypeKey).(string)
	terminalID, ok := middleware.GetUserIDFromContext(r.Context())
	return terminalID, ok && tokenType == "terminal" && terminalID != ""
}

func terminalExperienceManifestResponse(manifest *services.TerminalExperienceManifest) (any, error) {
	if manifest == nil {
		return nil, errors.New("terminal experience manifest is nil")
	}
	switch manifest.Mode {
	case services.TerminalExperienceModeLegacy:
		return LegacyManifest{Mode: services.TerminalExperienceModeLegacy}, nil
	case services.TerminalExperienceModeExperience:
		if strings.TrimSpace(manifest.TemplateID) == "" || strings.TrimSpace(manifest.VersionID) == "" || manifest.Version < 1 || strings.TrimSpace(manifest.VariantID) == "" || len(manifest.Definition) == 0 || manifest.PublishedAt == nil {
			return nil, errors.New("terminal experience manifest is incomplete")
		}
		return ExperienceManifest{
			Mode:        services.TerminalExperienceModeExperience,
			TemplateID:  manifest.TemplateID,
			VersionID:   manifest.VersionID,
			Version:     manifest.Version,
			VariantID:   manifest.VariantID,
			Definition:  manifest.Definition,
			PublishedAt: *manifest.PublishedAt,
		}, nil
	default:
		return nil, errors.New("terminal experience manifest has an unknown mode")
	}
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
// @Success      200 {object} TerminalExperienceManifestResponseDoc
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
	response, err := terminalExperienceManifestResponse(manifest)
	if err != nil {
		respondTerminalExperienceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

// terminalExperienceAckPayload is decoded strictly before being projected to a
// concrete acknowledgement variant. Terminal identity always comes from JWT.
type terminalExperienceAckPayload struct {
	VersionID  string  `json:"versionId" binding:"required"`
	Status     string  `json:"status" enums:"applied,rejected"`
	ReasonCode *string `json:"reasonCode,omitempty" maxLength:"64" example:"renderer.timeout"`
}

func decodeTerminalExperienceAck(w http.ResponseWriter, r *http.Request) (terminalExperienceAckPayload, error) {
	var request terminalExperienceAckPayload
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, terminalExperienceAckMaxBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return terminalExperienceAckPayload{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return terminalExperienceAckPayload{}, errUnexpectedTerminalExperienceAckJSON
		}
		return terminalExperienceAckPayload{}, err
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

type terminalExperienceAcknowledgement interface {
	terminalExperienceAcknowledgementValues() (versionID, status string, reasonCode *string)
}

func (ack AppliedExperienceAcknowledgement) terminalExperienceAcknowledgementValues() (string, string, *string) {
	return ack.VersionID, "applied", nil
}

func (ack RejectedExperienceAcknowledgement) terminalExperienceAcknowledgementValues() (string, string, *string) {
	reasonCode := ack.ReasonCode
	return ack.VersionID, "rejected", &reasonCode
}

func terminalExperienceAcknowledgementFromPayload(request terminalExperienceAckPayload) (terminalExperienceAcknowledgement, bool) {
	if request.VersionID == "" {
		return nil, false
	}
	switch request.Status {
	case "applied":
		if request.ReasonCode != nil {
			return nil, false
		}
		return AppliedExperienceAcknowledgement{VersionID: request.VersionID, Status: "applied"}, true
	case "rejected":
		if request.ReasonCode == nil || len(*request.ReasonCode) > 64 || !terminalExperienceReasonCodePattern.MatchString(*request.ReasonCode) {
			return nil, false
		}
		return RejectedExperienceAcknowledgement{VersionID: request.VersionID, Status: "rejected", ReasonCode: *request.ReasonCode}, true
	default:
		return nil, false
	}
}

// Acknowledge godoc
// @ID           AcknowledgeTerminalExperienceManifest
// @Summary      Acknowledge the terminal experience manifest
// @Description  Records whether the authenticated terminal applied or rejected its currently published assigned version. Rejected deployments require a bounded machine-readable reasonCode and preserve the last successfully applied version; applied deployments forbid one.
// @Tags         DesktopTerminal
// @Accept       json
// @Produce      json
// @Param        body body TerminalExperienceAckRequestDoc true "Acknowledgement payload"
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
	payload, err := decodeTerminalExperienceAck(w, r)
	acknowledgement, valid := terminalExperienceAcknowledgementFromPayload(payload)
	if err != nil || !valid {
		http.Error(w, "Invalid acknowledgement payload", http.StatusBadRequest)
		return
	}
	versionID, status, reasonCode := acknowledgement.terminalExperienceAcknowledgementValues()
	if err := h.service.AcknowledgeTerminalExperience(r.Context(), terminalID, versionID, status, reasonCode); err != nil {
		respondTerminalExperienceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
