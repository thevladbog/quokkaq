package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/sso/redisstore"
	"quokkaq-go-backend/internal/testsupport"
	"quokkaq-go-backend/pkg/database"

	"github.com/alicebob/miniredis/v2"
	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// stubCalendarUserRepo implements ResolveCompanyIDForRequest for handler tests; other methods panic via embed.
type stubCalendarUserRepo struct {
	testsupport.PanicUserRepo
	CompanyID string
	Err       error
}

func (s stubCalendarUserRepo) ResolveCompanyIDForRequest(string, string) (string, error) {
	if s.Err != nil {
		return "", s.Err
	}
	return s.CompanyID, nil
}

func reqWithUserID(r *http.Request, userID string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), middleware.UserIDKey, userID))
}

func setupCalendarHandlerTestSQLite(t *testing.T) func() {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL,
	parent_id text,
	code text NOT NULL,
	kind text NOT NULL DEFAULT 'subdivision',
	sort_order integer NOT NULL DEFAULT 0,
	name text NOT NULL,
	timezone text NOT NULL,
	config text,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE unit_calendar_integrations (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	kind text NOT NULL,
	display_name text NOT NULL DEFAULT '',
	enabled integer NOT NULL DEFAULT 0,
	caldav_base_url text NOT NULL,
	calendar_path text NOT NULL,
	username text NOT NULL,
	app_password_encrypted text NOT NULL,
	timezone text NOT NULL,
	admin_notify_emails text,
	last_sync_at datetime,
	last_sync_error text,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE pre_registrations (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	service_id text NOT NULL,
	date text NOT NULL,
	time text NOT NULL,
	code text NOT NULL,
	customer_first_name text NOT NULL,
	customer_last_name text NOT NULL,
	customer_phone text NOT NULL,
	comment text,
	status text,
	ticket_id text,
	external_event_href text,
	external_event_etag text,
	calendar_integration_id text,
	created_at datetime,
	updated_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}
	old := database.DB
	database.DB = db
	return func() { database.DB = old }
}

func setupPickTestRedis(t *testing.T) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		mr.Close()
		redisstore.ResetClientForTest()
	})
	host, port, err := net.SplitHostPort(mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	prevHost, prevPort, prevDis := os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT"), os.Getenv("SSO_REDIS_DISABLED")
	t.Cleanup(func() {
		restore := func(k, v string) {
			if v == "" {
				_ = os.Unsetenv(k)
			} else {
				_ = os.Setenv(k, v)
			}
		}
		restore("REDIS_HOST", prevHost)
		restore("REDIS_PORT", prevPort)
		restore("SSO_REDIS_DISABLED", prevDis)
	})
	_ = os.Setenv("REDIS_HOST", host)
	_ = os.Setenv("REDIS_PORT", port)
	_ = os.Setenv("SSO_REDIS_DISABLED", "false")
	redisstore.ResetClientForTest()
}

func newHandlerTestCalendarService() *services.CalendarIntegrationService {
	return services.NewCalendarIntegrationService(
		repository.NewCalendarIntegrationRepository(),
		repository.NewServiceRepository(),
		repository.NewUnitRepository(),
		nil,
	)
}

func TestCalendarIntegrationHandler_GooglePickListCalendars_Unauthorized(t *testing.T) {
	t.Parallel()
	h := NewCalendarIntegrationHandler(nil, nil)
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"pickToken":"any"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.GooglePickListCalendars(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestCalendarIntegrationHandler_GooglePickComplete_Unauthorized(t *testing.T) {
	t.Parallel()
	h := NewCalendarIntegrationHandler(nil, nil)
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"pickToken":"t","calendarId":"c"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.GooglePickComplete(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestCalendarIntegrationHandler_GooglePickListCalendars_InvalidJSON(t *testing.T) {
	t.Parallel()
	h := NewCalendarIntegrationHandler(nil, stubCalendarUserRepo{CompanyID: "co"})
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{`))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	w := httptest.NewRecorder()
	h.GooglePickListCalendars(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestCalendarIntegrationHandler_GooglePickListCalendars_EmptyPickToken(t *testing.T) {
	t.Parallel()
	var nilSvc *services.CalendarIntegrationService
	h := NewCalendarIntegrationHandler(nilSvc, stubCalendarUserRepo{CompanyID: "co"})
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"pickToken":""}`))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	w := httptest.NewRecorder()
	h.GooglePickListCalendars(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
	b, _ := io.ReadAll(w.Body)
	if !bytes.Contains(b, []byte("invalid or expired")) {
		t.Fatalf("body %q", b)
	}
}

func TestCalendarIntegrationHandler_GooglePickListCalendars_CompanyResolveForbidden(t *testing.T) {
	t.Parallel()
	h := NewCalendarIntegrationHandler(nil, stubCalendarUserRepo{Err: repository.ErrCompanyAccessDenied})
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"pickToken":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	w := httptest.NewRecorder()
	h.GooglePickListCalendars(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestCalendarIntegrationHandler_GooglePickListCalendars_ServiceUnavailableNoGoogleOAuth(t *testing.T) {
	defer setupCalendarHandlerTestSQLite(t)()
	setupPickTestRedis(t)
	if err := database.DB.Create(&models.Unit{
		ID:        "unit-h1",
		CompanyID: "co-h1",
		Code:      "h1",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pickTok := "handler-list-503"
	pay := services.GoogleCalendarPickPayload{
		CompanyID:    "co-h1",
		UnitID:       "unit-h1",
		ReturnPath:   "/settings/integrations",
		RefreshToken: "refresh-x",
		Email:        "user@gmail.com",
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickTok), pay, time.Minute); err != nil {
		t.Fatal(err)
	}
	svc := newHandlerTestCalendarService()
	h := NewCalendarIntegrationHandler(svc, stubCalendarUserRepo{CompanyID: "co-h1"})
	body := strings.NewReader(`{"pickToken":"` + pickTok + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "admin-1")
	w := httptest.NewRecorder()
	h.GooglePickListCalendars(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}

func TestCalendarIntegrationHandler_GooglePickComplete_OK(t *testing.T) {
	defer setupCalendarHandlerTestSQLite(t)()
	setupPickTestRedis(t)
	if err := database.DB.Create(&models.Unit{
		ID:        "unit-h2",
		CompanyID: "co-h2",
		Code:      "h2",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pickTok := "handler-complete-ok"
	calID := "room@group.calendar.google.com"
	pay := services.GoogleCalendarPickPayload{
		CompanyID:    "co-h2",
		UnitID:       "unit-h2",
		ReturnPath:   "/settings/integrations",
		RefreshToken: "refresh-ok",
		Email:        "owner@gmail.com",
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickTok), pay, time.Minute); err != nil {
		t.Fatal(err)
	}
	svc := newHandlerTestCalendarService()
	h := NewCalendarIntegrationHandler(svc, stubCalendarUserRepo{CompanyID: "co-h2"})
	payload := map[string]string{"pickToken": pickTok, "calendarId": calID}
	raw, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "admin-1")
	w := httptest.NewRecorder()
	h.GooglePickComplete(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
	var pub services.CalendarIntegrationPublic
	if err := json.NewDecoder(w.Body).Decode(&pub); err != nil {
		t.Fatal(err)
	}
	wantPath := models.GoogleCalDAVEventsCollectionPath(calID)
	if pub.CalendarPath != wantPath {
		t.Fatalf("calendarPath %q want %q", pub.CalendarPath, wantPath)
	}
}

func TestCalendarIntegrationHandler_GooglePickComplete_EmptyPickToken(t *testing.T) {
	t.Parallel()
	var nilSvc *services.CalendarIntegrationService
	h := NewCalendarIntegrationHandler(nilSvc, stubCalendarUserRepo{CompanyID: "co"})
	raw, _ := json.Marshal(map[string]string{"pickToken": "", "calendarId": "x"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	w := httptest.NewRecorder()
	h.GooglePickComplete(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %q", w.Code, w.Body.String())
	}
}
