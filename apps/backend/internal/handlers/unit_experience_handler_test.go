package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
)

type unitExperienceHandlerService struct {
	manifest *services.TerminalExperienceManifest
	err      error
}

func (s unitExperienceHandlerService) ResolveUnitQueueDisplay(context.Context, string, string) (*services.TerminalExperienceManifest, error) {
	return s.manifest, s.err
}

func (unitExperienceHandlerService) UpdateUnitQueueDisplayExperience(context.Context, string, string, repository.UnitExperienceAssignment) error {
	panic("unexpected assignment update")
}

func unitExperienceManifestRequest(target string, params map[string]string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestUnitExperienceHandler_ManifestReturnsLegacyWhenAssignmentIsUnavailable(t *testing.T) {
	handler := NewUnitExperienceHandler(unitExperienceHandlerService{err: services.ErrExperienceTemplateUnpublished}, testsupport.PanicUserRepo{})
	w := httptest.NewRecorder()
	handler.Manifest(w, unitExperienceManifestRequest("/units/unit-1/queue-display-experience", map[string]string{"unitId": "unit-1"}))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var response map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["mode"] != services.TerminalExperienceModeLegacy {
		t.Fatalf("mode = %v, want legacy", response["mode"])
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache-control = %q, want no-store", w.Header().Get("Cache-Control"))
	}
}

func TestUnitExperienceHandler_ManifestReturnsValidatedProjection(t *testing.T) {
	publishedAt := time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)
	handler := NewUnitExperienceHandler(unitExperienceHandlerService{
		manifest: &services.TerminalExperienceManifest{
			Mode:        services.TerminalExperienceModeExperience,
			TemplateID:  "template-1",
			VersionID:   "version-1",
			Version:     2,
			VariantID:   "display",
			Definition:  json.RawMessage(`{"surface":"queue-display"}`),
			PublishedAt: &publishedAt,
		},
	}, testsupport.PanicUserRepo{})
	w := httptest.NewRecorder()
	handler.Manifest(w, unitExperienceManifestRequest("/units/unit-1/queue-display-experience?profile=landscape", map[string]string{"unitId": "unit-1"}))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var response services.TerminalExperienceManifest
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Mode != services.TerminalExperienceModeExperience || response.VersionID != "version-1" || response.VariantID != "display" {
		t.Fatalf("response = %+v", response)
	}
}

func TestUnitExperienceHandler_ManifestRejectsUnknownProfile(t *testing.T) {
	handler := NewUnitExperienceHandler(unitExperienceHandlerService{}, testsupport.PanicUserRepo{})
	w := httptest.NewRecorder()
	handler.Manifest(w, unitExperienceManifestRequest("/units/unit-1/queue-display-experience?profile=square", map[string]string{"unitId": "unit-1"}))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	if body := w.Body.String(); body != "invalid profile\n" {
		t.Fatalf("body = %q", body)
	}
}
