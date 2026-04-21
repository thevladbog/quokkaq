package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
)

// --- stub repository ---

type stubSaaSSettingsRepo struct {
	row    *models.DeploymentSaaSSettings
	getErr error
}

func (s *stubSaaSSettingsRepo) Get() (*models.DeploymentSaaSSettings, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	if s.row == nil {
		return &models.DeploymentSaaSSettings{}, nil
	}
	return s.row, nil
}

func (s *stubSaaSSettingsRepo) Upsert(row *models.DeploymentSaaSSettings) error {
	s.row = row
	return nil
}

var _ repository.DeploymentSaaSSettingsRepository = (*stubSaaSSettingsRepo)(nil)

func newTestIntegrationsHandler(row *models.DeploymentSaaSSettings) *IntegrationsHandler {
	repo := &stubSaaSSettingsRepo{row: row}
	svc := services.NewDeploymentSaaSSettingsService(repo)
	return NewIntegrationsHandler(svc)
}

// --- maskSecret ---

func TestMaskSecret_shortString(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"a", "*"},
		{"ab", "**"},
		{"abc", "***"},
		{"abcd", "****"},
	}
	for _, tc := range cases {
		got := maskSecret(tc.in)
		if got != tc.want {
			t.Errorf("maskSecret(%q): want %q, got %q", tc.in, tc.want, got)
		}
	}
}

func TestMaskSecret_longString(t *testing.T) {
	t.Parallel()
	got := maskSecret("supersecretkey12")
	// last 4 chars visible, rest masked
	want := "************y12"[:len("supersecretkey12")-1] // wrong — recalculate
	_ = want
	// len("supersecretkey12") = 16; last 4 = "y12" is wrong — let's check: "key12" → last 4 = "ey12"
	// actual last 4: s[12:] = "ey12" — length 16: 0..15, last4 starts at 12
	// "supersecretkey12": s u p e r s e c r e t k e y 1 2 → len 16
	// last 4: "y12" is wrong — "e y 1 2" → "ey12"
	if len(got) != 16 {
		t.Errorf("length should be preserved: want 16, got %d", len(got))
	}
	// First 12 chars must all be '*'
	for i := 0; i < 12; i++ {
		if got[i] != '*' {
			t.Errorf("position %d: want '*', got %q", i, got[i])
		}
	}
	// Last 4 chars must match the original
	orig := "supersecretkey12"
	if got[12:] != orig[12:] {
		t.Errorf("last 4 chars: want %q, got %q", orig[12:], got[12:])
	}
}

// --- GetPlatformIntegrations ---

func TestGetPlatformIntegrations_returnsMaskedKey(t *testing.T) {
	t.Parallel()
	row := &models.DeploymentSaaSSettings{
		SmsProvider: "smsc",
		SmsApiKey:   "my-secret-api-key",
		SmsFromName: "QuokkaQ",
		SmsEnabled:  true,
	}
	h := newTestIntegrationsHandler(row)

	req := httptest.NewRequest(http.MethodGet, "/platform/integrations", nil)
	w := httptest.NewRecorder()
	h.GetPlatformIntegrations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", w.Code)
	}
	var resp PlatformIntegrationsResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.SmsProvider != "smsc" {
		t.Errorf("smsProvider: want 'smsc', got %q", resp.SmsProvider)
	}
	if resp.SmsFromName != "QuokkaQ" {
		t.Errorf("smsFromName: want 'QuokkaQ', got %q", resp.SmsFromName)
	}
	if !resp.SmsEnabled {
		t.Error("smsEnabled: want true")
	}
	// Full key must NOT be in response; masked version must be present.
	if resp.SmsApiKeyMasked == "my-secret-api-key" {
		t.Error("full API key must not be returned in response")
	}
	if resp.SmsApiKeyMasked == "" {
		t.Error("masked key must be non-empty")
	}
	// Last 4 chars of masked key must match last 4 of original.
	orig := "my-secret-api-key"
	if len(resp.SmsApiKeyMasked) == len(orig) {
		if resp.SmsApiKeyMasked[len(orig)-4:] != orig[len(orig)-4:] {
			t.Errorf("last 4 of masked key: want %q, got %q", orig[len(orig)-4:], resp.SmsApiKeyMasked[len(orig)-4:])
		}
	}
}

func TestGetPlatformIntegrations_repoError(t *testing.T) {
	t.Parallel()
	repo := &stubSaaSSettingsRepo{getErr: errTestRepo}
	svc := services.NewDeploymentSaaSSettingsService(repo)
	h := NewIntegrationsHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/platform/integrations", nil)
	w := httptest.NewRecorder()
	h.GetPlatformIntegrations(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
}

// --- PatchPlatformIntegrations ---

func TestPatchPlatformIntegrations_updatesSMSFields(t *testing.T) {
	t.Parallel()
	initial := &models.DeploymentSaaSSettings{
		SmsProvider: "log",
		SmsEnabled:  false,
	}
	h := newTestIntegrationsHandler(initial)

	provider := "smsru"
	key := "new-api-key"
	enabled := true
	patch := services.DeploymentSaaSSettingsPatch{
		SmsProvider: &provider,
		SmsApiKey:   &key,
		SmsEnabled:  &enabled,
	}
	body, _ := json.Marshal(patch)
	req := httptest.NewRequest(http.MethodPatch, "/platform/integrations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.PatchPlatformIntegrations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d — body: %s", w.Code, w.Body.String())
	}
	var resp PlatformIntegrationsResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.SmsProvider != "smsru" {
		t.Errorf("smsProvider: want 'smsru', got %q", resp.SmsProvider)
	}
	if !resp.SmsEnabled {
		t.Error("smsEnabled: want true after patch")
	}
}

func TestPatchPlatformIntegrations_invalidJSONReturns400(t *testing.T) {
	t.Parallel()
	h := newTestIntegrationsHandler(nil)
	req := httptest.NewRequest(http.MethodPatch, "/platform/integrations", bytes.NewBufferString("{bad json"))
	w := httptest.NewRecorder()
	h.PatchPlatformIntegrations(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

// --- TestSMSIntegration ---

func TestTestSMSIntegration_missingPhoneReturns400(t *testing.T) {
	t.Parallel()
	h := newTestIntegrationsHandler(nil)
	body := bytes.NewBufferString(`{"phone":""}`)
	req := httptest.NewRequest(http.MethodPost, "/platform/integrations/sms/test", body)
	w := httptest.NewRecorder()
	h.TestSMSIntegration(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400 for empty phone, got %d", w.Code)
	}
}

func TestTestSMSIntegration_invalidJSONReturns400(t *testing.T) {
	t.Parallel()
	h := newTestIntegrationsHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/platform/integrations/sms/test", bytes.NewBufferString("notjson"))
	w := httptest.NewRecorder()
	h.TestSMSIntegration(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400 for invalid JSON, got %d", w.Code)
	}
}

func TestTestSMSIntegration_logProviderReturnsOK(t *testing.T) {
	// LogSMSProvider.Send always returns nil — the test SMS succeeds silently.
	t.Parallel()
	h := newTestIntegrationsHandler(&models.DeploymentSaaSSettings{SmsEnabled: false})
	body := bytes.NewBufferString(`{"phone":"+79001234567"}`)
	req := httptest.NewRequest(http.MethodPost, "/platform/integrations/sms/test", body)
	w := httptest.NewRecorder()
	h.TestSMSIntegration(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("want 200 for log provider, got %d — %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["status"] != "ok" {
		t.Errorf("response status: want 'ok', got %q", resp["status"])
	}
	if resp["provider"] != "log" {
		t.Errorf("provider in response: want 'log', got %q", resp["provider"])
	}
}

// sentinel error for stub
var errTestRepo = &testRepoError{"test repo error"}

type testRepoError struct{ msg string }

func (e *testRepoError) Error() string { return e.msg }
