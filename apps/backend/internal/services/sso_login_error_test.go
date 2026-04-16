package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/testsupport"

	"gorm.io/gorm"
)

type extNotFoundSSORepo struct{ testsupport.SSORepoNoopAudit }

func (extNotFoundSSORepo) FindExternalIdentity(string, string) (*models.UserExternalIdentity, error) {
	return nil, gorm.ErrRecordNotFound
}

type noTenantAccessUserRepo struct{ testsupport.PanicUserRepo }

func (noTenantAccessUserRepo) FindByEmail(string) (*models.User, error) {
	return &models.User{ID: "u1"}, nil
}

func (noTenantAccessUserRepo) HasCompanyAccess(string, string) (bool, error) {
	return false, nil
}

func TestSSOErrorQueryCode(t *testing.T) {
	t.Parallel()
	cases := []struct {
		err  error
		want string
	}{
		{ErrSSOEmailRequired, "email_required"},
		{ErrSSONoCompanyAccess, "no_tenant_access"},
		{ErrSSONotProvisioned, "not_provisioned"},
		{errors.New("other"), "denied"},
		{fmt.Errorf("wrap: %w", ErrSSONoCompanyAccess), "no_tenant_access"},
	}
	for _, tc := range cases {
		if got := ssoErrorQueryCode(tc.err); got != tc.want {
			t.Errorf("ssoErrorQueryCode(%v) = %q, want %q", tc.err, got, tc.want)
		}
	}
}

func TestLoginPageSSOErrorURL(t *testing.T) {
	t.Setenv("PUBLIC_APP_URL", "http://app.test")
	t.Setenv("LOGIN_REDIRECT_LOCALE", "en")
	got := loginPageSSOErrorURL("no_tenant_access", "")
	if !strings.Contains(got, "/en/login?") || !strings.Contains(got, "sso_error=no_tenant_access") {
		t.Fatalf("unexpected URL: %q", got)
	}
}

func TestResolveSSOUser_NoCompanyAccessSentinel(t *testing.T) {
	t.Parallel()
	svc := NewSSOService(
		testsupport.PanicCompanyRepo{},
		&noTenantAccessUserRepo{},
		&extNotFoundSSORepo{},
		fakeAuthExchange{},
	)
	company := &models.Company{ID: "c1", SsoJitProvisioning: true}
	conn := &models.CompanySSOConnection{}
	_, err := svc.resolveSSOUser(context.Background(), company, conn, "iss", "sub", "a@b.com", "n", true)
	if !errors.Is(err, ErrSSONoCompanyAccess) {
		t.Fatalf("want ErrSSONoCompanyAccess, got %v", err)
	}
	if ssoErrorQueryCode(err) != "no_tenant_access" {
		t.Fatal("query code mapping")
	}
}

func TestLoginPageSSOErrorURL_RespectsLocaleEnv(t *testing.T) {
	t.Setenv("PUBLIC_APP_URL", "http://x")
	t.Setenv("LOGIN_REDIRECT_LOCALE", "ru")
	if got := loginPageSSOErrorURL("denied", ""); !strings.Contains(got, "/ru/login?") {
		t.Fatalf("%q", got)
	}
}

func TestLoginPageSSOErrorURL_FlowLocaleOverridesEnv(t *testing.T) {
	t.Setenv("PUBLIC_APP_URL", "http://x")
	t.Setenv("LOGIN_REDIRECT_LOCALE", "en")
	got := loginPageSSOErrorURL("denied", "ru")
	if !strings.Contains(got, "/ru/login?") {
		t.Fatalf("want /ru/ in %q", got)
	}
}

type captureAuditSSORepo struct {
	testsupport.PanicSSORepo
	last *models.SSOAuditEvent
}

func (c *captureAuditSSORepo) InsertSSOAudit(_ context.Context, e *models.SSOAuditEvent) error {
	c.last = e
	return nil
}

func TestRedirectLoginSSOError_AuditAndLocation(t *testing.T) {
	t.Setenv("PUBLIC_APP_URL", "http://app.test")
	t.Setenv("LOGIN_REDIRECT_LOCALE", "en")
	repo := &captureAuditSSORepo{}
	svc := NewSSOService(testsupport.PanicCompanyRepo{}, testsupport.PanicUserRepo{}, repo, fakeAuthExchange{})
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	cid := "co-1"
	svc.redirectLoginSSOError(r.Context(), w, r, &cid, "no_tenant_access", "oidc_callback_denied:no_tenant_access", "ru")
	if w.Code != http.StatusFound {
		t.Fatalf("status %d", w.Code)
	}
	loc := w.Header().Get("Location")
	if !strings.Contains(loc, "sso_error=no_tenant_access") || !strings.Contains(loc, "/ru/login") {
		t.Fatalf("Location %q", loc)
	}
	if repo.last == nil {
		t.Fatal("expected audit event")
	}
	if repo.last.Success || repo.last.UserID != nil {
		t.Fatalf("audit: %+v", repo.last)
	}
	if repo.last.CompanyID == nil || *repo.last.CompanyID != cid {
		t.Fatalf("company id in audit: %+v", repo.last)
	}
}
