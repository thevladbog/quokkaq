package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"
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

func (s stubSupportReportRepo) ListForUser(string, bool) ([]models.SupportReport, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (stubSupportReportRepo) Update(*models.SupportReport) error {
	panic("unexpected Update")
}

type stubSupportUserRepo struct{ testsupport.PanicUserRepo }

func (stubSupportUserRepo) IsAdmin(string) (bool, error) {
	return false, nil
}

func newTestSupportReportHandler(repo repository.SupportReportRepository) *SupportReportHandler {
	svc := services.NewSupportReportService(repo, nil, stubSupportUserRepo{})
	return NewSupportReportHandler(svc)
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
	large := bytes.Repeat([]byte("a"), (1<<20)+1)
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
