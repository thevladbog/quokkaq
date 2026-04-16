package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
)

type fakeAuthExchange struct{}

func (fakeAuthExchange) Login(string, string, string) (*services.TokenPair, error) {
	panic("unexpected")
}
func (fakeAuthExchange) GetMe(string) (*models.User, error) { panic("unexpected") }
func (fakeAuthExchange) RequestPasswordReset(string) error  { panic("unexpected") }
func (fakeAuthExchange) ResetPassword(string, string) error { panic("unexpected") }
func (fakeAuthExchange) Signup(string, string, string, string, string, *string) (*services.TokenPair, error) {
	panic("unexpected")
}
func (fakeAuthExchange) Refresh(string) (*services.TokenPair, error) { panic("unexpected") }
func (fakeAuthExchange) IssueTokenPairForUserID(string) (*services.TokenPair, error) {
	return &services.TokenPair{AccessToken: "at", RefreshToken: "rt"}, nil
}

func TestSSOHandler_TenantHint_JSONShape(t *testing.T) {
	t.Parallel()
	svc := services.NewSSOService(
		testsupport.StrictPublicTenantCompanyRepo{},
		testsupport.PanicUserRepo{},
		testsupport.PanicSSORepo{},
		testsupport.PanicUnitRepo{},
		fakeAuthExchange{},
	)
	h := NewSSOHandler(svc)

	body := strings.NewReader(`{"email":"local"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login/tenant-hint", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.TenantHint(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	allowed := map[string]struct{}{
		"next": {}, "tenantSlug": {}, "displayName": {}, "ssoAvailable": {},
	}
	for k := range raw {
		if _, ok := allowed[k]; !ok {
			t.Fatalf("unexpected JSON key %q", k)
		}
	}
	if string(raw["next"]) != `"choose_slug"` {
		t.Fatalf("next = %s", raw["next"])
	}
}

func TestSSOHandler_PublicTenant_StrictReturns404(t *testing.T) {
	t.Parallel()
	svc := services.NewSSOService(
		testsupport.StrictPublicTenantCompanyRepo{},
		testsupport.PanicUserRepo{},
		testsupport.PanicSSORepo{},
		testsupport.PanicUnitRepo{},
		fakeAuthExchange{},
	)
	h := NewSSOHandler(svc)

	r := chi.NewRouter()
	r.Get("/public/tenants/{slug}", h.PublicTenant)
	req := httptest.NewRequest(http.MethodGet, "/public/tenants/acme-corp", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestSSOHandler_SSOExchange_InvalidCode401(t *testing.T) {
	t.Setenv("SSO_REDIS_DISABLED", "true")
	svc := services.NewSSOService(
		testsupport.StrictPublicTenantCompanyRepo{},
		testsupport.PanicUserRepo{},
		testsupport.PanicSSORepo{},
		testsupport.PanicUnitRepo{},
		fakeAuthExchange{},
	)
	h := NewSSOHandler(svc)

	body := bytes.NewReader([]byte(`{"code":"any"}`))
	req := httptest.NewRequest(http.MethodPost, "/auth/sso/exchange", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.SSOExchange(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
	b, _ := io.ReadAll(w.Body)
	if !bytes.Contains(b, []byte("invalid or expired code")) {
		t.Fatalf("body %q", b)
	}
}
