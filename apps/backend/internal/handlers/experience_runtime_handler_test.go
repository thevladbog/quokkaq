package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"gorm.io/gorm"
)

type runtimeManifestService struct {
	terminalIDs []string
	manifest    *services.TerminalExperienceManifest
	err         error
	ack         *runtimeAckCall
	ackErr      error
}

type runtimeAckCall struct {
	terminalID string
	versionID  string
	status     string
	reasonCode *string
}

func (s *runtimeManifestService) ResolveTerminalExperience(ctx context.Context, terminalID string) (*services.TerminalExperienceManifest, error) {
	s.terminalIDs = append(s.terminalIDs, terminalID)
	return s.manifest, s.err
}

func (s *runtimeManifestService) AcknowledgeTerminalExperience(ctx context.Context, terminalID, versionID, status string, reasonCode *string) error {
	s.ack = &runtimeAckCall{terminalID: terminalID, versionID: versionID, status: status, reasonCode: reasonCode}
	return s.ackErr
}

func TestExperienceRuntimeHandler_ManifestUsesAuthenticatedTerminalSubject(t *testing.T) {
	publishedAt := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)
	svc := &runtimeManifestService{manifest: &services.TerminalExperienceManifest{
		Mode:        services.TerminalExperienceModeExperience,
		TemplateID:  "template-published",
		VersionID:   "version-published",
		Version:     7,
		VariantID:   "portrait",
		Definition:  json.RawMessage(`{"published":true}`),
		PublishedAt: &publishedAt,
	}}
	handler := NewExperienceRuntimeHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/terminal/experience?terminalId=terminal-other", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Manifest(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if len(svc.terminalIDs) != 1 || svc.terminalIDs[0] != "terminal-authenticated" {
		t.Fatalf("runtime service terminal ids = %v, want authenticated subject only", svc.terminalIDs)
	}

	var got map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["mode"] != "experience" || got["templateId"] != "template-published" || got["versionId"] != "version-published" || got["variantId"] != "portrait" || got["publishedAt"] != "2026-08-10T12:00:00Z" {
		t.Fatalf("manifest = %#v", got)
	}
	definition, ok := got["definition"].(map[string]any)
	if !ok || definition["published"] != true {
		t.Fatalf("definition = %#v, want stored published definition", got["definition"])
	}
}

func TestExperienceRuntimeHandler_StaleAcknowledgementFailsWithoutStateLeak(t *testing.T) {
	handler := NewExperienceRuntimeHandler(&runtimeManifestService{ackErr: repository.ErrExperienceAcknowledgementVersionNotCurrent})
	req := httptest.NewRequest(http.MethodPost, "/terminal/experience/ack", strings.NewReader(`{"versionId":"stale-version","status":"applied"}`))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Acknowledge(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusConflict || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d cache=%q body=%s", recorder.Code, recorder.Header().Get("Cache-Control"), recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "stale-version") {
		t.Fatalf("stale acknowledgement leaked request identifier: %s", recorder.Body.String())
	}
}

func TestExperienceRuntimeHandler_UnassignedTerminalReturnsOnlyLegacyMode(t *testing.T) {
	handler := NewExperienceRuntimeHandler(&runtimeManifestService{manifest: &services.TerminalExperienceManifest{
		Mode: services.TerminalExperienceModeLegacy,
	}})
	req := httptest.NewRequest(http.MethodGet, "/terminal/experience", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Manifest(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got["mode"] != "legacy" {
		t.Fatalf("legacy manifest = %#v, want exactly {mode: legacy}", got)
	}
}

func TestExperienceRuntimeHandler_AcknowledgeUsesAuthenticatedTerminalSubject(t *testing.T) {
	svc := &runtimeManifestService{}
	handler := NewExperienceRuntimeHandler(svc)
	req := httptest.NewRequest(http.MethodPost, "/terminal/experience/ack?terminalId=terminal-other", strings.NewReader(`{"versionId":"version-published","status":"rejected","reasonCode":"renderer.timeout"}`))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Acknowledge(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if svc.ack == nil || svc.ack.terminalID != "terminal-authenticated" || svc.ack.versionID != "version-published" || svc.ack.status != "rejected" || svc.ack.reasonCode == nil || *svc.ack.reasonCode != "renderer.timeout" {
		t.Fatalf("ack = %#v, want authenticated subject and validated acknowledgement", svc.ack)
	}
}

func TestExperienceRuntimeHandler_UnavailableAssignmentFailsClosedWithoutManifest(t *testing.T) {
	handler := NewExperienceRuntimeHandler(&runtimeManifestService{err: services.ErrExperienceTemplateUnpublished})
	req := httptest.NewRequest(http.MethodGet, "/terminal/experience", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Manifest(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if strings.Contains(recorder.Body.String(), "template") || strings.Contains(recorder.Body.String(), "version") {
		t.Fatalf("conflict leaked assignment metadata: %s", recorder.Body.String())
	}
}

func TestExperienceRuntimeHandler_RevokedTerminalDenialDoesNotLeakManifest(t *testing.T) {
	handler := NewExperienceRuntimeHandler(&runtimeManifestService{err: gorm.ErrRecordNotFound})
	req := httptest.NewRequest(http.MethodGet, "/terminal/experience", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-revoked")
	ctx = context.WithValue(ctx, middleware.TokenTypeKey, "terminal")
	recorder := httptest.NewRecorder()

	handler.Manifest(recorder, req.WithContext(ctx))

	if recorder.Code != http.StatusUnauthorized || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d cache=%q body=%s", recorder.Code, recorder.Header().Get("Cache-Control"), recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "terminal-revoked") || strings.Contains(recorder.Body.String(), "template") || strings.Contains(recorder.Body.String(), "version") {
		t.Fatalf("terminal denial leaked runtime metadata: %s", recorder.Body.String())
	}
}

func TestExperienceRuntimeHandler_AcknowledgementRequestIsStrictAndTerminalOnly(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		tokenType  string
		wantStatus int
	}{
		{name: "unknown terminal selector", body: `{"versionId":"version-a","status":"applied","terminalId":"terminal-other"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "trailing JSON", body: `{"versionId":"version-a","status":"applied"} {}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "applied with reason", body: `{"versionId":"version-a","status":"applied","reasonCode":"renderer.timeout"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "rejected without reason", body: `{"versionId":"version-a","status":"rejected"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "rejected raw error", body: `{"versionId":"version-a","status":"rejected","reasonCode":"Renderer error: timed out"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "rejected overlong reason", body: `{"versionId":"version-a","status":"rejected","reasonCode":"` + strings.Repeat("a", 65) + `"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "oversized body", body: `{"versionId":"version-a","status":"rejected","reasonCode":"` + strings.Repeat("a", 4096) + `"}`, tokenType: "terminal", wantStatus: http.StatusBadRequest},
		{name: "staff JWT", body: `{"versionId":"version-a","status":"applied"}`, tokenType: "user", wantStatus: http.StatusForbidden},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			svc := &runtimeManifestService{}
			handler := NewExperienceRuntimeHandler(svc)
			req := httptest.NewRequest(http.MethodPost, "/terminal/experience/ack", strings.NewReader(testCase.body))
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, "terminal-authenticated")
			ctx = context.WithValue(ctx, middleware.TokenTypeKey, testCase.tokenType)
			recorder := httptest.NewRecorder()

			handler.Acknowledge(recorder, req.WithContext(ctx))

			if recorder.Code != testCase.wantStatus {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
				t.Fatalf("Cache-Control = %q, want no-store", got)
			}
			if svc.ack != nil {
				t.Fatalf("invalid request reached service: %#v", svc.ack)
			}
		})
	}
}

func TestRegisterTerminalExperienceRoutes_UsesOnlyTerminalJWTAuthentication(t *testing.T) {
	t.Setenv("JWT_SECRET", "terminal-runtime-route-test")
	svc := &runtimeManifestService{manifest: &services.TerminalExperienceManifest{Mode: services.TerminalExperienceModeLegacy}}
	router := chi.NewRouter()
	RegisterTerminalExperienceRoutes(router, NewExperienceRuntimeHandler(svc))

	claims := jwt.MapClaims{"sub": "terminal-authenticated", "typ": "terminal", "unit_id": "unit-a"}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("terminal-runtime-route-test"))
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/terminal/experience?terminalId=terminal-second", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK || len(svc.terminalIDs) != 1 || svc.terminalIDs[0] != "terminal-authenticated" {
		t.Fatalf("status=%d terminalIDs=%v body=%s", recorder.Code, svc.terminalIDs, recorder.Body.String())
	}
	secondToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "terminal-second", "typ": "terminal", "unit_id": "unit-b"}).SignedString([]byte("terminal-runtime-route-test"))
	if err != nil {
		t.Fatal(err)
	}
	secondReq := httptest.NewRequest(http.MethodGet, "/terminal/experience?terminalId=terminal-authenticated", nil)
	secondReq.Header.Set("Authorization", "Bearer "+secondToken)
	secondRecorder := httptest.NewRecorder()
	router.ServeHTTP(secondRecorder, secondReq)
	if secondRecorder.Code != http.StatusOK || len(svc.terminalIDs) != 2 || svc.terminalIDs[1] != "terminal-second" {
		t.Fatalf("second status=%d terminalIDs=%v body=%s", secondRecorder.Code, svc.terminalIDs, secondRecorder.Body.String())
	}
	userToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "staff-user", "typ": "access"}).SignedString([]byte("terminal-runtime-route-test"))
	if err != nil {
		t.Fatal(err)
	}
	userReq := httptest.NewRequest(http.MethodGet, "/terminal/experience", nil)
	userReq.Header.Set("Authorization", "Bearer "+userToken)
	userRecorder := httptest.NewRecorder()
	router.ServeHTTP(userRecorder, userReq)
	if userRecorder.Code != http.StatusForbidden || userRecorder.Header().Get("Cache-Control") != "no-store" || len(svc.terminalIDs) != 2 {
		t.Fatalf("user status=%d cache=%q terminalIDs=%v body=%s", userRecorder.Code, userRecorder.Header().Get("Cache-Control"), svc.terminalIDs, userRecorder.Body.String())
	}
}

func TestRegisterTerminalExperienceRoutes_SetsNoStoreBeforeTerminalAuthentication(t *testing.T) {
	t.Setenv("JWT_SECRET", "terminal-runtime-cache-route-test")
	svc := &runtimeManifestService{manifest: &services.TerminalExperienceManifest{Mode: services.TerminalExperienceModeLegacy}}
	router := chi.NewRouter()
	router.Get("/unrelated", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	RegisterTerminalExperienceRoutes(router, NewExperienceRuntimeHandler(svc))

	sign := func(t *testing.T, claims jwt.MapClaims) string {
		t.Helper()
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("terminal-runtime-cache-route-test"))
		if err != nil {
			t.Fatal(err)
		}
		return "Bearer " + token
	}
	terminalAuth := sign(t, jwt.MapClaims{"sub": "terminal-authenticated", "typ": "terminal", "unit_id": "unit-a"})
	staffAuth := sign(t, jwt.MapClaims{"sub": "staff-user", "typ": "access"})

	tests := []struct {
		name          string
		method        string
		path          string
		body          string
		auth          string
		serviceErr    error
		serviceAckErr error
		wantStatus    int
		wantBody      string
	}{
		{name: "missing JWT", method: http.MethodGet, path: "/terminal/experience", wantStatus: http.StatusUnauthorized, wantBody: "Authentication required\n"},
		{name: "acknowledgement missing JWT", method: http.MethodPost, path: "/terminal/experience/ack", body: `{"versionId":"version-a","status":"applied"}`, wantStatus: http.StatusUnauthorized, wantBody: "Authentication required\n"},
		{name: "malformed JWT", method: http.MethodGet, path: "/terminal/experience", auth: "Bearer malformed", wantStatus: http.StatusUnauthorized, wantBody: "Invalid or expired token\n"},
		{name: "acknowledgement malformed JWT", method: http.MethodPost, path: "/terminal/experience/ack", body: `{"versionId":"version-a","status":"applied"}`, auth: "Bearer malformed", wantStatus: http.StatusUnauthorized, wantBody: "Invalid or expired token\n"},
		{name: "wrong token type", method: http.MethodGet, path: "/terminal/experience", auth: staffAuth, wantStatus: http.StatusForbidden, wantBody: "Forbidden\n"},
		{name: "acknowledgement wrong token type", method: http.MethodPost, path: "/terminal/experience/ack", body: `{"versionId":"version-a","status":"applied"}`, auth: staffAuth, wantStatus: http.StatusForbidden, wantBody: "Forbidden\n"},
		{name: "revoked terminal service denial", method: http.MethodGet, path: "/terminal/experience", auth: terminalAuth, serviceErr: gorm.ErrRecordNotFound, wantStatus: http.StatusUnauthorized, wantBody: "Unauthorized\n"},
		{name: "acknowledgement revoked terminal service denial", method: http.MethodPost, path: "/terminal/experience/ack", auth: terminalAuth, body: `{"versionId":"version-a","status":"applied"}`, serviceAckErr: gorm.ErrRecordNotFound, wantStatus: http.StatusUnauthorized, wantBody: "Unauthorized\n"},
		{name: "strict acknowledgement validation", method: http.MethodPost, path: "/terminal/experience/ack", auth: terminalAuth, body: `{"versionId":"version-a","status":"applied","unexpected":true}`, wantStatus: http.StatusBadRequest, wantBody: "Invalid acknowledgement payload\n"},
		{name: "manifest success", method: http.MethodGet, path: "/terminal/experience", auth: terminalAuth, wantStatus: http.StatusOK, wantBody: ""},
		{name: "acknowledgement success", method: http.MethodPost, path: "/terminal/experience/ack", auth: terminalAuth, body: `{"versionId":"version-a","status":"applied"}`, wantStatus: http.StatusNoContent, wantBody: ""},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			svc.err = testCase.serviceErr
			svc.ackErr = testCase.serviceAckErr
			svc.ack = nil
			svc.terminalIDs = nil
			req := httptest.NewRequest(testCase.method, testCase.path, strings.NewReader(testCase.body))
			if testCase.auth != "" {
				req.Header.Set("Authorization", testCase.auth)
			}
			if testCase.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			recorder := httptest.NewRecorder()

			router.ServeHTTP(recorder, req)

			if recorder.Code != testCase.wantStatus || recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d cache=%q body=%q", recorder.Code, recorder.Header().Get("Cache-Control"), recorder.Body.String())
			}
			if testCase.wantBody != "" && recorder.Body.String() != testCase.wantBody {
				t.Fatalf("body=%q, want %q", recorder.Body.String(), testCase.wantBody)
			}
		})
	}

	unrelatedRecorder := httptest.NewRecorder()
	router.ServeHTTP(unrelatedRecorder, httptest.NewRequest(http.MethodGet, "/unrelated", nil))
	if unrelatedRecorder.Code != http.StatusNoContent || unrelatedRecorder.Header().Get("Cache-Control") != "" {
		t.Fatalf("unrelated status=%d cache=%q", unrelatedRecorder.Code, unrelatedRecorder.Header().Get("Cache-Control"))
	}
	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodDelete, "/terminal/experience", nil),
		httptest.NewRequest(http.MethodGet, "/terminal/experience/ack", nil),
	} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusMethodNotAllowed || recorder.Header().Get("Cache-Control") != "" {
			t.Fatalf("unsupported %s %s status=%d cache=%q", request.Method, request.URL.Path, recorder.Code, recorder.Header().Get("Cache-Control"))
		}
	}
}
