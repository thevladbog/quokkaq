package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetupWizardTokenGate_ProdMissingToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SETUP_TOKEN", "")

	req := httptest.NewRequest(http.MethodGet, "/system/health", nil)
	rec := httptest.NewRecorder()
	called := false
	SetupWizardTokenGate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rec.Code, rec.Body.String())
	}
	if called {
		t.Fatal("handler should not run")
	}
}

func TestSetupWizardTokenGate_ProdValidToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SETUP_TOKEN", "good")

	req := httptest.NewRequest(http.MethodPost, "/system/setup", nil)
	req.Header.Set("X-Setup-Token", "good")
	rec := httptest.NewRecorder()
	called := false
	SetupWizardTokenGate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !called {
		t.Fatal("handler should run")
	}
}
