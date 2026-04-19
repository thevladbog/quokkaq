package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type stubSupportReportRepo struct {
	findRes *models.SupportReport
	findErr error
	list    []models.SupportReport
	listErr error
}

func (stubSupportReportRepo) Create(*models.SupportReport) error {
	panic("unexpected Create")
}

func (s stubSupportReportRepo) FindByID(string) (*models.SupportReport, error) {
	return s.findRes, s.findErr
}

func (s stubSupportReportRepo) ListForUser(string, repository.SupportReportListScope) ([]models.SupportReport, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (stubSupportReportRepo) Update(*models.SupportReport) error {
	panic("unexpected Update")
}

func (stubSupportReportRepo) DeleteByID(string) error {
	panic("unexpected DeleteByID")
}

type stubSupportUserRepo struct{ testsupport.PanicUserRepo }

func (stubSupportUserRepo) FindByID(_ context.Context, id string) (*models.User, error) {
	return &models.User{ID: id, Name: "Report Author"}, nil
}

func (stubSupportUserRepo) GetCompanyIDByUserID(string) (string, error) {
	return "company-test", nil
}

func (stubSupportUserRepo) IsCompanyOwner(string, string) (bool, error) {
	return false, nil
}

func (stubSupportUserRepo) IsAdmin(string) (bool, error) {
	return false, nil
}

func (stubSupportUserRepo) IsPlatformAdmin(string) (bool, error) { return false, nil }

func (stubSupportUserRepo) ListCompanyIDsForSupportReportTenantWideAccess(string) ([]string, error) {
	return nil, nil
}

func (stubSupportUserRepo) HasTenantSystemAdminRoleInCompany(string, string) (bool, error) {
	return false, nil
}

func (stubSupportUserRepo) ListUserIDsWithTenantSystemAdminInCompany(string) ([]string, error) {
	return nil, nil
}

func (stubSupportUserRepo) HasSupportReportAccess(string) (bool, error) {
	return true, nil
}

func (stubSupportUserRepo) ListUserIDsByRoleNames([]string) ([]string, error) {
	return nil, nil
}

func newTestSupportReportHandler(repo repository.SupportReportRepository) *SupportReportHandler {
	svc := services.NewSupportReportService(repo, nil, nil, nil, nil, services.SupportReportPlatformNone, stubSupportUserRepo{}, nil)
	return NewSupportReportHandler(svc)
}

func newTestSupportReportHandlerWithPlane(repo repository.SupportReportRepository, plane services.SupportReportTicketClient) *SupportReportHandler {
	svc := services.NewSupportReportService(repo, nil, plane, nil, nil, models.TicketBackendPlane, stubSupportUserRepo{}, nil)
	return NewSupportReportHandler(svc)
}

type stubSupportUserRepoAdmin struct{ stubSupportUserRepo }

func (stubSupportUserRepoAdmin) IsPlatformAdmin(string) (bool, error) {
	return true, nil
}

type memSupportReportRepo struct {
	mu sync.Mutex
	m  map[string]*models.SupportReport
}

func newMemSupportReportRepo() *memSupportReportRepo {
	return &memSupportReportRepo{m: make(map[string]*models.SupportReport)}
}

func (m *memSupportReportRepo) Create(row *models.SupportReport) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *row
	m.m[row.ID] = &cp
	return nil
}

func (m *memSupportReportRepo) FindByID(id string) (*models.SupportReport, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.m[id]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	cp := *r
	return &cp, nil
}

func (m *memSupportReportRepo) ListForUser(userID string, scope repository.SupportReportListScope) ([]models.SupportReport, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []models.SupportReport
	for _, row := range m.m {
		cp := *row
		if scope.PlatformWide || row.CreatedByUserID == userID {
			out = append(out, cp)
			continue
		}
		if len(scope.TenantCompanyIDs) > 0 {
			// Mem store has no company on rows; include all rows when tenant-wide scope is active (tenant admin list).
			out = append(out, cp)
		}
	}
	return out, nil
}

func (m *memSupportReportRepo) Update(row *models.SupportReport) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.m[row.ID]; !ok {
		return gorm.ErrRecordNotFound
	}
	cp := *row
	m.m[row.ID] = &cp
	return nil
}

func (m *memSupportReportRepo) DeleteByID(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.m, id)
	return nil
}

type testPlaneStub struct {
	createErr error
	wid       string
	seq       int
	state     string
	addCalls  int
}

func (t *testPlaneStub) Enabled() bool { return true }

func (t *testPlaneStub) CreateWorkItem(_ context.Context, _, _, _ string, _ services.SupportReportTicketCreateExtras) (string, *int, string, error) {
	if t.createErr != nil {
		return "", nil, "", t.createErr
	}
	wid := t.wid
	if wid == "" {
		wid = "plane-wi-1"
	}
	s := t.seq
	if s == 0 {
		s = 42
	}
	seq := s
	st := t.state
	if st == "" {
		st = "Todo"
	}
	return wid, &seq, st, nil
}

func (t *testPlaneStub) GetWorkItem(context.Context, string) (*int, string, error) {
	return nil, "", nil
}

func (t *testPlaneStub) AddComment(_ context.Context, _, _ string) error {
	t.addCalls++
	return services.ErrPlaneCommentsUnsupported
}

func TestSupportReportHandler_Create_Unauthorized(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	req := httptest.NewRequest(
		http.MethodPost,
		"/support/reports",
		bytes.NewReader([]byte(`{"title":"a","description":"b"}`)),
	)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("Create: want %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestSupportReportHandler_List_Unauthorized(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	req := httptest.NewRequest(http.MethodGet, "/support/reports", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("List: want %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestSupportReportHandler_GetByID_Unauthorized(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	r := chi.NewRouter()
	r.Get("/support/reports/{id}", h.GetByID)
	req := httptest.NewRequest(http.MethodGet, "/support/reports/x", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("GetByID: want %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestSupportReportHandler_List_OK_Empty(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{list: []models.SupportReport{}})
	req := httptest.NewRequest(http.MethodGet, "/support/reports", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.List(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("List: want %d, got %d", http.StatusOK, rr.Code)
	}
	var out []models.SupportReport
	if err := json.NewDecoder(rr.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out == nil || len(out) != 0 {
		t.Fatalf("List: want empty JSON array, got %#v", out)
	}
}

func TestSupportReportHandler_Create_PlaneNotConfigured(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	body := `{"title":"t","description":"d"}`
	req := httptest.NewRequest(http.MethodPost, "/support/reports", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("Create: want %d, got %d body=%q", http.StatusServiceUnavailable, rr.Code, rr.Body.String())
	}
}

func TestSupportReportHandler_GetByID_NotFound(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{findErr: gorm.ErrRecordNotFound})
	r := chi.NewRouter()
	r.Get("/support/reports/{id}", h.GetByID)
	req := httptest.NewRequest(http.MethodGet, "/support/reports/nope", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("GetByID: want %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestSupportReportHandler_Create_InvalidJSON(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	req := httptest.NewRequest(
		http.MethodPost,
		"/support/reports",
		bytes.NewReader([]byte(`{"title":`)),
	)
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("Create: want %d, got %d body=%q", http.StatusBadRequest, rr.Code, rr.Body.String())
	}
}

func TestSupportReportHandler_Create_BodyTooLarge(t *testing.T) {
	t.Parallel()
	h := newTestSupportReportHandler(stubSupportReportRepo{})
	large := bytes.Repeat([]byte("a"), MaxSupportReportCreateBodyBytes+1)
	req := httptest.NewRequest(http.MethodPost, "/support/reports", bytes.NewReader(large))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("Create: want %d, got %d", http.StatusRequestEntityTooLarge, rr.Code)
	}
}

func TestSupportReportHandler_GetByID_Forbidden(t *testing.T) {
	t.Parallel()
	otherUserRow := &models.SupportReport{
		ID:              "rep-1",
		CreatedByUserID: "other-user",
		PlaneWorkItemID: "pw-1",
		Title:           "t",
	}
	h := newTestSupportReportHandler(stubSupportReportRepo{findRes: otherUserRow})
	r := chi.NewRouter()
	r.Get("/support/reports/{id}", h.GetByID)
	req := httptest.NewRequest(http.MethodGet, "/support/reports/rep-1", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("GetByID: want %d, got %d body=%q", http.StatusForbidden, rr.Code, rr.Body.String())
	}
}

func TestSupportReportHandler_Create_201(t *testing.T) {
	t.Parallel()
	mem := newMemSupportReportRepo()
	h := newTestSupportReportHandlerWithPlane(mem, &testPlaneStub{})
	body := `{"title":"hello","description":"world","diagnostics":{"k":1}}`
	req := httptest.NewRequest(http.MethodPost, "/support/reports", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Create: want %d, got %d body=%q", http.StatusCreated, rr.Code, rr.Body.String())
	}
	var out models.SupportReport
	if err := json.NewDecoder(rr.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out.PlaneWorkItemID == "" || out.TraceID == "" {
		t.Fatalf("expected external id and trace id, got %+v", out)
	}
	if out.TicketBackend != models.TicketBackendPlane {
		t.Fatalf("ticketBackend: want %q, got %q", models.TicketBackendPlane, out.TicketBackend)
	}
	if out.Title != "hello" {
		t.Fatalf("title: want hello, got %q", out.Title)
	}
}

func TestSupportReportHandler_Create_PlaneErrorDeletesRow(t *testing.T) {
	t.Parallel()
	mem := newMemSupportReportRepo()
	h := newTestSupportReportHandlerWithPlane(mem, &testPlaneStub{createErr: errors.New("plane down")})
	body := `{"title":"t","description":"d"}`
	req := httptest.NewRequest(http.MethodPost, "/support/reports", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusBadGateway {
		t.Fatalf("Create: want %d, got %d body=%q", http.StatusBadGateway, rr.Code, rr.Body.String())
	}
	mem.mu.Lock()
	n := len(mem.m)
	mem.mu.Unlock()
	if n != 0 {
		t.Fatalf("expected DB row removed after Plane failure, got %d rows", n)
	}
}

func TestSupportReportHandler_Create_Plane503ServiceUnavailable(t *testing.T) {
	t.Parallel()
	mem := newMemSupportReportRepo()
	h := newTestSupportReportHandlerWithPlane(mem, &testPlaneStub{createErr: &services.PlaneHTTPError{
		HTTPStatus: http.StatusServiceUnavailable,
		Body:       "no available server",
	}})
	body := `{"title":"t","description":"d"}`
	req := httptest.NewRequest(http.MethodPost, "/support/reports", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("Create: want %d, got %d body=%q", http.StatusServiceUnavailable, rr.Code, rr.Body.String())
	}
	mem.mu.Lock()
	n := len(mem.m)
	mem.mu.Unlock()
	if n != 0 {
		t.Fatalf("expected DB row removed after Plane failure, got %d rows", n)
	}
}

func TestSupportReportHandler_List_OK_WithRows(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	mem := newMemSupportReportRepo()
	_ = mem.Create(&models.SupportReport{
		ID:              "r1",
		CreatedByUserID: "user-1",
		Title:           "a",
		PlaneWorkItemID: "p1",
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	_ = mem.Create(&models.SupportReport{
		ID:              "r2",
		CreatedByUserID: "user-1",
		Title:           "b",
		PlaneWorkItemID: "p2",
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	h := newTestSupportReportHandler(mem)
	req := httptest.NewRequest(http.MethodGet, "/support/reports", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	h.List(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("List: want %d, got %d", http.StatusOK, rr.Code)
	}
	var out []models.SupportReport
	if err := json.NewDecoder(rr.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("List: want 2 rows, got %d", len(out))
	}
}

func TestSupportReportHandler_GetByID_OK_Author(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	mem := newMemSupportReportRepo()
	_ = mem.Create(&models.SupportReport{
		ID:              "r-own",
		CreatedByUserID: "user-1",
		Title:           "mine",
		PlaneWorkItemID: "",
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	h := newTestSupportReportHandler(mem)
	r := chi.NewRouter()
	r.Get("/support/reports/{id}", h.GetByID)
	req := httptest.NewRequest(http.MethodGet, "/support/reports/r-own", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GetByID: want %d, got %d body=%q", http.StatusOK, rr.Code, rr.Body.String())
	}
	var got models.SupportReport
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.ID != "r-own" || got.Title != "mine" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestSupportReportHandler_MarkIrrelevant_Author_OK(t *testing.T) {
	t.Parallel()
	stub := &testPlaneStub{}
	mem := newMemSupportReportRepo()
	now := time.Now().UTC()
	_ = mem.Create(&models.SupportReport{
		ID:              "r1",
		CreatedByUserID: "user-1",
		Title:           "t",
		PlaneWorkItemID: "wi-1",
		TicketBackend:   models.TicketBackendPlane,
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	svc := services.NewSupportReportService(mem, nil, stub, nil, nil, models.TicketBackendPlane, stubSupportUserRepo{}, nil)
	h := NewSupportReportHandler(svc)
	r := chi.NewRouter()
	r.Post("/support/reports/{id}/mark-irrelevant", h.MarkIrrelevant)
	req := httptest.NewRequest(http.MethodPost, "/support/reports/r1/mark-irrelevant", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("MarkIrrelevant: want %d, got %d body=%q", http.StatusOK, rr.Code, rr.Body.String())
	}
	if stub.addCalls != 1 {
		t.Fatalf("AddComment calls: want 1, got %d", stub.addCalls)
	}
	row, err := mem.FindByID("r1")
	if err != nil {
		t.Fatal(err)
	}
	if row.MarkedIrrelevantAt == nil || row.MarkedIrrelevantByUserID != "user-1" {
		t.Fatalf("expected marked irrelevant by author, got %+v", row)
	}
}

func TestSupportReportHandler_MarkIrrelevant_Idempotent(t *testing.T) {
	t.Parallel()
	stub := &testPlaneStub{}
	mem := newMemSupportReportRepo()
	now := time.Now().UTC()
	marked := now.Add(-time.Hour)
	_ = mem.Create(&models.SupportReport{
		ID:                       "r1",
		CreatedByUserID:          "user-1",
		Title:                    "t",
		PlaneWorkItemID:          "wi-1",
		TicketBackend:            models.TicketBackendPlane,
		MarkedIrrelevantAt:       &marked,
		MarkedIrrelevantByUserID: "user-1",
		CreatedAt:                now,
		UpdatedAt:                now,
	})
	svc := services.NewSupportReportService(mem, nil, stub, nil, nil, models.TicketBackendPlane, stubSupportUserRepo{}, nil)
	h := NewSupportReportHandler(svc)
	r := chi.NewRouter()
	r.Post("/support/reports/{id}/mark-irrelevant", h.MarkIrrelevant)
	req := httptest.NewRequest(http.MethodPost, "/support/reports/r1/mark-irrelevant", nil)
	req = reqWithUserID(req, "user-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("MarkIrrelevant: want %d, got %d", http.StatusOK, rr.Code)
	}
	if stub.addCalls != 0 {
		t.Fatalf("AddComment on idempotent path: want 0, got %d", stub.addCalls)
	}
}

func TestSupportReportHandler_MarkIrrelevant_Forbidden(t *testing.T) {
	t.Parallel()
	stub := &testPlaneStub{}
	mem := newMemSupportReportRepo()
	now := time.Now().UTC()
	_ = mem.Create(&models.SupportReport{
		ID:              "r1",
		CreatedByUserID: "user-1",
		Title:           "t",
		PlaneWorkItemID: "wi-1",
		TicketBackend:   models.TicketBackendPlane,
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	svc := services.NewSupportReportService(mem, nil, stub, nil, nil, models.TicketBackendPlane, stubSupportUserRepo{}, nil)
	h := NewSupportReportHandler(svc)
	r := chi.NewRouter()
	r.Post("/support/reports/{id}/mark-irrelevant", h.MarkIrrelevant)
	req := httptest.NewRequest(http.MethodPost, "/support/reports/r1/mark-irrelevant", nil)
	req = reqWithUserID(req, "user-2")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("MarkIrrelevant: want %d, got %d", http.StatusForbidden, rr.Code)
	}
}

func TestSupportReportHandler_MarkIrrelevant_Admin_OK(t *testing.T) {
	t.Parallel()
	stub := &testPlaneStub{}
	mem := newMemSupportReportRepo()
	now := time.Now().UTC()
	_ = mem.Create(&models.SupportReport{
		ID:              "r1",
		CreatedByUserID: "user-1",
		Title:           "t",
		PlaneWorkItemID: "wi-1",
		TicketBackend:   models.TicketBackendPlane,
		CreatedAt:       now,
		UpdatedAt:       now,
	})
	svc := services.NewSupportReportService(mem, nil, stub, nil, nil, models.TicketBackendPlane, stubSupportUserRepoAdmin{}, nil)
	h := NewSupportReportHandler(svc)
	r := chi.NewRouter()
	r.Post("/support/reports/{id}/mark-irrelevant", h.MarkIrrelevant)
	req := httptest.NewRequest(http.MethodPost, "/support/reports/r1/mark-irrelevant", nil)
	req = reqWithUserID(req, "admin-1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("MarkIrrelevant: want %d, got %d body=%q", http.StatusOK, rr.Code, rr.Body.String())
	}
	row, err := mem.FindByID("r1")
	if err != nil {
		t.Fatal(err)
	}
	if row.MarkedIrrelevantByUserID != "admin-1" {
		t.Fatalf("marked by admin: got %q", row.MarkedIrrelevantByUserID)
	}
}
