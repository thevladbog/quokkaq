package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
)

type desktopExperienceUserRepo struct {
	testsupport.PanicUserRepo
}

func (desktopExperienceUserRepo) ResolveCompanyIDForRequest(userID, companyHeader string) (string, error) {
	if userID != "actor" {
		return "", errors.New("unexpected actor")
	}
	return "company-a", nil
}

func (desktopExperienceUserRepo) IsPlatformAdmin(string) (bool, error) { return false, nil }

type desktopExperienceUnitRepo struct {
	testsupport.PanicUnitRepo
	units map[string]*models.Unit
}

func (r desktopExperienceUnitRepo) FindByIDLight(id string) (*models.Unit, error) {
	unit := r.units[id]
	if unit == nil {
		return nil, errors.New("unit lookup failed")
	}
	copy := *unit
	return &copy, nil
}

type desktopExperienceService struct {
	terminal *models.DesktopTerminal
	update   func(companyID, id string, name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind *string, assignment services.TerminalExperienceAssignment) error
}

func (s desktopExperienceService) Create(*string, string, string, bool, *string, *string, string) (*models.DesktopTerminal, string, error) {
	panic("unexpected Create")
}
func (s desktopExperienceService) ListForCompany(string) ([]models.DesktopTerminal, error) {
	panic("unexpected ListForCompany")
}
func (s desktopExperienceService) GetByID(string) (*models.DesktopTerminal, error) {
	if s.terminal == nil {
		return nil, errors.New("missing terminal")
	}
	copy := *s.terminal
	return &copy, nil
}
func (s desktopExperienceService) Update(companyID, id string, name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind *string, assignment services.TerminalExperienceAssignment) error {
	if s.update == nil {
		panic("unexpected Update")
	}
	return s.update(companyID, id, name, unitID, defaultLocale, kioskFullscreen, contextUnitID, counterID, kind, assignment)
}
func (s desktopExperienceService) Revoke(string) error { panic("unexpected Revoke") }
func (s desktopExperienceService) Bootstrap(string) (string, string, string, string, bool, *string, string, error) {
	panic("unexpected Bootstrap")
}

func desktopExperienceRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPatch, "/desktop-terminals/terminal-a", strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "terminal-a")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, middleware.UserIDKey, "actor")
	return req.WithContext(ctx)
}

func newDesktopExperienceHandler(service desktopExperienceService, units map[string]*models.Unit) *DesktopTerminalHandler {
	return NewDesktopTerminalHandler(service, desktopExperienceUserRepo{}, desktopExperienceUnitRepo{units: units})
}

func ownedDesktopTerminal(companyID string) *models.DesktopTerminal {
	return &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk,
		DefaultLocale: "en", Unit: models.Unit{ID: "unit-a", CompanyID: companyID},
	}
}

func TestDesktopTerminalHandler_ExperienceOwnershipChecksRunBeforeAssignment(t *testing.T) {
	t.Run("existing terminal tenant is hidden before payload decode", func(t *testing.T) {
		called := false
		handler := newDesktopExperienceHandler(desktopExperienceService{
			terminal: ownedDesktopTerminal("company-b"),
			update: func(string, string, *string, string, string, bool, *string, *string, *string, services.TerminalExperienceAssignment) error {
				called = true
				return nil
			},
		}, map[string]*models.Unit{})
		recorder := httptest.NewRecorder()
		handler.Update(recorder, desktopExperienceRequest(`not-json`))
		if recorder.Code != http.StatusNotFound || called {
			t.Fatalf("response=%d %q updateCalled=%v", recorder.Code, recorder.Body.String(), called)
		}
	})

	t.Run("requested unit tenant is hidden before assignment", func(t *testing.T) {
		called := false
		handler := newDesktopExperienceHandler(desktopExperienceService{
			terminal: ownedDesktopTerminal("company-a"),
			update: func(string, string, *string, string, string, bool, *string, *string, *string, services.TerminalExperienceAssignment) error {
				called = true
				return nil
			},
		}, map[string]*models.Unit{"unit-b": {ID: "unit-b", CompanyID: "company-b"}})
		recorder := httptest.NewRecorder()
		handler.Update(recorder, desktopExperienceRequest(`{"unitId":"unit-b","defaultLocale":"en","experienceTemplateId":"template-secret","experienceVariantId":"portrait"}`))
		if recorder.Code != http.StatusNotFound || called || strings.Contains(recorder.Body.String(), "template-secret") {
			t.Fatalf("response=%d %q updateCalled=%v", recorder.Code, recorder.Body.String(), called)
		}
	})
}

func TestDesktopTerminalHandler_ExperienceAssignmentPairSemantics(t *testing.T) {
	units := map[string]*models.Unit{"unit-a": {ID: "unit-a", CompanyID: "company-a"}}
	t.Run("rejects half assignment", func(t *testing.T) {
		called := false
		handler := newDesktopExperienceHandler(desktopExperienceService{
			terminal: ownedDesktopTerminal("company-a"),
			update: func(string, string, *string, string, string, bool, *string, *string, *string, services.TerminalExperienceAssignment) error {
				called = true
				return nil
			},
		}, units)
		recorder := httptest.NewRecorder()
		handler.Update(recorder, desktopExperienceRequest(`{"unitId":"unit-a","defaultLocale":"en","experienceTemplateId":"template-a"}`))
		if recorder.Code != http.StatusBadRequest || called {
			t.Fatalf("response=%d %q updateCalled=%v", recorder.Code, recorder.Body.String(), called)
		}
	})

	tests := []struct {
		name         string
		body         string
		wantSet      bool
		wantTemplate *string
		wantVariant  *string
	}{
		{name: "assign", body: `{"unitId":"unit-a","defaultLocale":"en","experienceTemplateId":"template-a","experienceVariantId":"portrait","experienceAckStatus":"applied"}`, wantSet: true, wantTemplate: stringPtr("template-a"), wantVariant: stringPtr("portrait")},
		{name: "unassign", body: `{"unitId":"unit-a","defaultLocale":"en","experienceTemplateId":null,"experienceVariantId":null}`, wantSet: true},
		{name: "ordinary metadata update", body: `{"unitId":"unit-a","defaultLocale":"ru"}`, wantSet: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			called := false
			handler := newDesktopExperienceHandler(desktopExperienceService{
				terminal: ownedDesktopTerminal("company-a"),
				update: func(companyID, id string, _ *string, unitID, locale string, _ bool, _ *string, _ *string, _ *string, assignment services.TerminalExperienceAssignment) error {
					called = true
					if companyID != "company-a" || id != "terminal-a" || unitID != "unit-a" {
						t.Fatalf("update scope=%q %q unit=%q", companyID, id, unitID)
					}
					if assignment.Specified != tt.wantSet || !equalOptionalString(assignment.TemplateID, tt.wantTemplate) || !equalOptionalString(assignment.VariantID, tt.wantVariant) {
						t.Fatalf("assignment=%#v want set=%v template=%v variant=%v", assignment, tt.wantSet, tt.wantTemplate, tt.wantVariant)
					}
					return nil
				},
			}, units)
			recorder := httptest.NewRecorder()
			handler.Update(recorder, desktopExperienceRequest(tt.body))
			if recorder.Code != http.StatusNoContent || !called {
				t.Fatalf("response=%d %q updateCalled=%v", recorder.Code, recorder.Body.String(), called)
			}
		})
	}
}

func TestDesktopTerminalHandler_ExperienceAssignmentErrorsAreDeterministic(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
	}{
		{name: "incompatible kind", err: services.ErrExperienceAssignmentIncompatible, wantStatus: http.StatusBadRequest},
		{name: "missing variant", err: services.ErrExperienceVariantNotFound, wantStatus: http.StatusBadRequest},
		{name: "unpublished template", err: services.ErrExperienceTemplateUnpublished, wantStatus: http.StatusConflict},
		{name: "cross tenant template", err: services.ErrExperienceTemplateNotFound, wantStatus: http.StatusNotFound},
	}
	units := map[string]*models.Unit{"unit-a": {ID: "unit-a", CompanyID: "company-a"}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newDesktopExperienceHandler(desktopExperienceService{
				terminal: ownedDesktopTerminal("company-a"),
				update: func(string, string, *string, string, string, bool, *string, *string, *string, services.TerminalExperienceAssignment) error {
					return tt.err
				},
			}, units)
			recorder := httptest.NewRecorder()
			handler.Update(recorder, desktopExperienceRequest(`{"unitId":"unit-a","defaultLocale":"en","experienceTemplateId":"template-a","experienceVariantId":"portrait"}`))
			if recorder.Code != tt.wantStatus {
				t.Fatalf("response=%d %q want=%d", recorder.Code, recorder.Body.String(), tt.wantStatus)
			}
		})
	}
}

func TestDesktopTerminalJSON_ExperienceFieldsAreServerOutput(t *testing.T) {
	templateID, variantID, versionID := "template-a", "portrait", "version-1"
	status, reason := "rejected", "schema_invalid"
	now := time.Date(2026, 8, 9, 10, 0, 0, 0, time.UTC)
	out := mapTerminalToJSON(&models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
		ExperienceTemplateID: &templateID, ExperienceVariantID: &variantID,
		AppliedTemplateVersionID: &versionID, AppliedTemplateAt: &now,
		ExperienceAckStatus: &status, ExperienceAckReasonCode: &reason, ExperienceAckAt: &now,
	})
	if out.ExperienceTemplateID == nil || *out.ExperienceTemplateID != templateID || out.ExperienceVariantID == nil || *out.ExperienceVariantID != variantID || out.AppliedTemplateVersionID == nil || *out.AppliedTemplateVersionID != versionID || out.ExperienceAckStatus == nil || *out.ExperienceAckStatus != status {
		t.Fatalf("mapped terminal = %#v", out)
	}
}

func stringPtr(value string) *string { return &value }

func equalOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
