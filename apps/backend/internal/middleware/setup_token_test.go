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

func TestSetupWizardTokenGate_ProdWrongOrMissingTokenUnauthorized(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SETUP_TOKEN", "good")

	for _, tc := range []struct {
		name   string
		header string
	}{
		{"missing", ""},
		{"wrong", "bad"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/system/health", nil)
			if tc.header != "" {
				req.Header.Set("X-Setup-Token", tc.header)
			}
			rec := httptest.NewRecorder()
			called := false
			SetupWizardTokenGate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				called = true
			})).ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d body=%s", rec.Code, rec.Body.String())
			}
			if called {
				t.Fatal("handler should not run")
			}
		})
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
