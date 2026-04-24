package services

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// employeeIdpTestSchema is SQLite DDL compatible with GORM models used by EmployeeIdpService + repositories (no Postgres-only defaults).
const employeeIdpTestSchema = `
CREATE TABLE companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text,
  owner_user_id text,
  subscription_id text,
  is_saas_operator integer NOT NULL DEFAULT 0,
  billing_email text,
  billing_address text,
  payment_accounts text,
  counterparty text,
  settings text,
  onboarding_state text,
  strict_public_tenant_resolve integer NOT NULL DEFAULT 0,
  opaque_login_links_only integer NOT NULL DEFAULT 0,
  sso_jit_provisioning integer NOT NULL DEFAULT 0,
  sso_access_source text,
  onec_counterparty_guid text,
  invoice_default_payment_terms text,
  created_at text,
  updated_at text
);
CREATE TABLE units (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  parent_id text,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'subdivision',
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  name_en text,
  timezone text NOT NULL,
  config text,
  skill_based_routing_enabled integer NOT NULL DEFAULT 0,
  created_at text,
  updated_at text
);
CREATE TABLE users (
  id text PRIMARY KEY,
  type text,
  email text,
  phone text,
  name text NOT NULL,
  photo_url text,
  password text,
  is_active integer,
  exempt_from_sso_sync integer,
  sso_profile_sync_opt_out integer,
  created_at text
);
CREATE TABLE user_units (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  unit_id text NOT NULL,
  permissions text
);
CREATE TABLE unit_employee_idp_settings (
  id text PRIMARY KEY,
  unit_id text NOT NULL,
  enabled integer NOT NULL DEFAULT 0,
  http_method text NOT NULL DEFAULT 'POST',
  upstream_url text NOT NULL,
  request_body_template text,
  response_email_path text,
  response_display_name_path text,
  header_templates_json text NOT NULL DEFAULT '[]',
  timeout_ms integer NOT NULL DEFAULT 10000
);
CREATE TABLE unit_employee_idp_secrets (
  id text PRIMARY KEY,
  unit_id text NOT NULL,
  name text NOT NULL,
  ciphertext text NOT NULL
);
`

func setupEmployeeIdpServiceTestDB(t *testing.T) (cleanup func(), unitID, companyID string) {
	t.Helper()
	cid, uid := uuid.NewString(), uuid.NewString()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(employeeIdpTestSchema).Error; err != nil {
		t.Fatal(err)
	}
	old := database.DB
	database.DB = db
	cleanup = func() { database.DB = old }
	companyID = cid
	unitID = uid
	if err := db.Exec(`
INSERT INTO companies (id, name, slug, owner_user_id, subscription_id, is_saas_operator, billing_email,
  billing_address, payment_accounts, counterparty, settings, onboarding_state,
  strict_public_tenant_resolve, opaque_login_links_only, sso_jit_provisioning, sso_access_source,
  onec_counterparty_guid, invoice_default_payment_terms)
VALUES (?, 'C', ?, '', NULL, 1, '', NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 'manual', NULL, NULL)
`, cid, "c-"+cid).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
INSERT INTO units (id, company_id, parent_id, code, kind, sort_order, name, name_en, timezone, config, skill_based_routing_enabled)
VALUES (?, ?, NULL, '1', 'subdivision', 0, 'U', NULL, 'UTC', NULL, 0)
`, uid, cid).Error; err != nil {
		t.Fatal(err)
	}
	return cleanup, unitID, companyID
}

func withTLSClient(svc *EmployeeIdpService, tlsConfig *tls.Config) {
	if tlsConfig == nil {
		return
	}
	svc.httpClient = &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:       tlsConfig,
			MaxIdleConns:          4,
			IdleConnTimeout:       30 * time.Second,
			ResponseHeaderTimeout: 20 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}
}

func TestEmployeeIdp_ResolveKiosk_bad_localhost(t *testing.T) {
	restore := employeeIdpForbiddenUpstreamHost
	employeeIdpForbiddenUpstreamHost = func(host string) bool { return forbiddenUpstreamHost(host) }
	t.Cleanup(func() { employeeIdpForbiddenUpstreamHost = restore })

	clean, unitID, _ := setupEmployeeIdpServiceTestDB(t)
	t.Cleanup(clean)

	s := NewEmployeeIdpService(
		repository.NewUnitRepository(),
		repository.NewUserRepository(),
		repository.NewEmployeeIdpRepository(database.DB),
	)
	setID := uuid.NewString()
	_ = database.DB.Exec(`
INSERT INTO unit_employee_idp_settings (id, unit_id, enabled, http_method, upstream_url, request_body_template, response_email_path, header_templates_json, timeout_ms)
VALUES (?, ?, 1, 'POST', 'https://127.0.0.1/x', '{"x":1}', 'email', '[]', 5000)
`, setID, unitID).Error

	_, err := s.ResolveKiosk(context.Background(), unitID, EmployeeIdpResolveRequest{Kind: "badge", Raw: "x"})
	if err == nil {
		t.Fatal("expected error for loopback host")
	}
}

func TestEmployeeIdp_ResolveKiosk_matched(t *testing.T) {
	restoreH := employeeIdpForbiddenUpstreamHost
	employeeIdpForbiddenUpstreamHost = func(h string) bool { return false }
	t.Cleanup(func() { employeeIdpForbiddenUpstreamHost = restoreH })

	clean, unitID, _ := setupEmployeeIdpServiceTestDB(t)
	t.Cleanup(clean)

	emailLower := "jane@idp.test"
	uidA := uuid.NewString()
	_ = database.DB.Exec(`INSERT INTO users (id, type, email, name, is_active) VALUES (?, 'human', ?, 'Jane', 1)`, uidA, emailLower).Error
	uuID := uuid.NewString()
	_ = database.DB.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES (?, ?, ?, '[]')`, uuID, uidA, unitID).Error

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"user":{"email":"jane@idp.test","name":"Jane I"}}}`))
	}))
	t.Cleanup(srv.Close)

	s := NewEmployeeIdpService(
		repository.NewUnitRepository(),
		repository.NewUserRepository(),
		repository.NewEmployeeIdpRepository(database.DB),
	)
	if c := srv.Client().Transport.(*http.Transport).TLSClientConfig; c != nil {
		withTLSClient(s, c.Clone())
	}
	setID := uuid.NewString()
	_ = database.DB.Exec(`
INSERT INTO unit_employee_idp_settings (id, unit_id, enabled, http_method, upstream_url, request_body_template, response_email_path, response_display_name_path, header_templates_json, timeout_ms)
VALUES (?, ?, 1, 'POST', ?, '{"x":1}', 'data.user.email', 'data.user.name', '[]', 5000)
`, setID, unitID, srv.URL+"/resolve").Error

	res, err := s.ResolveKiosk(context.Background(), unitID, EmployeeIdpResolveRequest{Kind: "badge", Raw: "b1"})
	if err != nil {
		t.Fatal(err)
	}
	if res.MatchStatus != "matched" || res.UserID != uidA {
		t.Fatalf("got %#v", res)
	}
}

func TestEmployeeIdp_ResolveKiosk_no_user(t *testing.T) {
	restoreH := employeeIdpForbiddenUpstreamHost
	employeeIdpForbiddenUpstreamHost = func(h string) bool { return false }
	t.Cleanup(func() { employeeIdpForbiddenUpstreamHost = restoreH })

	clean, unitID, _ := setupEmployeeIdpServiceTestDB(t)
	t.Cleanup(clean)

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"email":"ghost@x.test"}`))
	}))
	t.Cleanup(srv.Close)

	s := NewEmployeeIdpService(
		repository.NewUnitRepository(),
		repository.NewUserRepository(),
		repository.NewEmployeeIdpRepository(database.DB),
	)
	if c := srv.Client().Transport.(*http.Transport).TLSClientConfig; c != nil {
		withTLSClient(s, c.Clone())
	}
	setID := uuid.NewString()
	_ = database.DB.Exec(`
INSERT INTO unit_employee_idp_settings (id, unit_id, enabled, http_method, upstream_url, request_body_template, response_email_path, header_templates_json, timeout_ms)
VALUES (?, ?, 1, 'POST', ?, '{}', 'email', '[]', 5000)
`, setID, unitID, srv.URL+"/").Error

	res, err := s.ResolveKiosk(context.Background(), unitID, EmployeeIdpResolveRequest{Kind: "login", Raw: "u1"})
	if err != nil {
		t.Fatal(err)
	}
	if res.MatchStatus != "no_user" || res.Email != "ghost@x.test" {
		t.Fatalf("got %#v", res)
	}
}

func TestEmployeeIdp_ResolveKiosk_ambiguous(t *testing.T) {
	restoreH := employeeIdpForbiddenUpstreamHost
	employeeIdpForbiddenUpstreamHost = func(h string) bool { return false }
	t.Cleanup(func() { employeeIdpForbiddenUpstreamHost = restoreH })

	clean, unitID, _ := setupEmployeeIdpServiceTestDB(t)
	t.Cleanup(clean)

	e1 := "Ambig@p.test"
	e2 := "ambig@p.test"
	uid1 := uuid.NewString()
	uid2 := uuid.NewString()
	_ = database.DB.Exec(`INSERT INTO users (id, type, email, name, is_active) VALUES (?, 'human', ?, 'A', 1)`, uid1, e1).Error
	_ = database.DB.Exec(`INSERT INTO users (id, type, email, name, is_active) VALUES (?, 'human', ?, 'B', 1)`, uid2, e2).Error
	_ = database.DB.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES (?, ?, ?, '[]')`, uuid.NewString(), uid1, unitID).Error
	_ = database.DB.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES (?, ?, ?, '[]')`, uuid.NewString(), uid2, unitID).Error

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"mail":"ambig@p.test"}`))
	}))
	t.Cleanup(srv.Close)

	s := NewEmployeeIdpService(
		repository.NewUnitRepository(),
		repository.NewUserRepository(),
		repository.NewEmployeeIdpRepository(database.DB),
	)
	if c := srv.Client().Transport.(*http.Transport).TLSClientConfig; c != nil {
		withTLSClient(s, c.Clone())
	}
	setID := uuid.NewString()
	_ = database.DB.Exec(`
INSERT INTO unit_employee_idp_settings (id, unit_id, enabled, http_method, upstream_url, request_body_template, response_email_path, header_templates_json, timeout_ms)
VALUES (?, ?, 1, 'POST', ?, '{}', 'mail', '[]', 5000)
`, setID, unitID, srv.URL+"/").Error

	res, err := s.ResolveKiosk(context.Background(), unitID, EmployeeIdpResolveRequest{Kind: "badge", Raw: "b"})
	if err != nil {
		t.Fatal(err)
	}
	if res.MatchStatus != "ambiguous" || res.UserID != "" || res.Email == "" {
		t.Fatalf("got %#v", res)
	}
}

func TestApplyHeaderTemplates_replacesSecretRef(t *testing.T) {
	r, _ := http.NewRequest(http.MethodGet, "https://ex.test/", nil)
	err := applyHeaderTemplates(r, `[
		{"name":"X-Key","value":"bearer ${secret:K1} tail"}
	]`, map[string]string{"K1": "tok9"})
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Header.Get("X-Key"); got != "bearer tok9 tail" {
		t.Fatal(got)
	}
}
