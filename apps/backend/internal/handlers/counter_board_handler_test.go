package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// stubSurveyServiceCounterBoard implements services.SurveyService for counter-board handler tests only.
type stubSurveyServiceCounterBoard struct {
	counterBoardSession func(ctx context.Context, unitID, terminalID string) (*services.CounterBoardSession, error)
}

func (s *stubSurveyServiceCounterBoard) ListDefinitions(context.Context, string, string) ([]models.SurveyDefinition, error) {
	panic("unexpected ListDefinitions")
}

func (s *stubSurveyServiceCounterBoard) CreateDefinition(context.Context, string, string, string, json.RawMessage, *json.RawMessage, *json.RawMessage, *json.RawMessage) (*models.SurveyDefinition, error) {
	panic("unexpected CreateDefinition")
}

func (s *stubSurveyServiceCounterBoard) UpdateDefinition(context.Context, string, string, string, *string, *json.RawMessage, *json.RawMessage, *json.RawMessage, *json.RawMessage) error {
	panic("unexpected UpdateDefinition")
}

func (s *stubSurveyServiceCounterBoard) SetActiveDefinition(context.Context, string, string, string) error {
	panic("unexpected SetActiveDefinition")
}

func (s *stubSurveyServiceCounterBoard) ListResponses(context.Context, string, string, int, int) ([]models.SurveyResponse, error) {
	panic("unexpected ListResponses")
}

func (s *stubSurveyServiceCounterBoard) ListResponsesForClient(context.Context, string, string, string) ([]models.SurveyResponse, error) {
	panic("unexpected ListResponsesForClient")
}

func (s *stubSurveyServiceCounterBoard) GuestSession(context.Context, string, string) (*services.GuestSurveySession, error) {
	panic("unexpected GuestSession")
}

func (s *stubSurveyServiceCounterBoard) CounterBoardSession(ctx context.Context, unitID, terminalID string) (*services.CounterBoardSession, error) {
	if s.counterBoardSession != nil {
		return s.counterBoardSession(ctx, unitID, terminalID)
	}
	return nil, nil
}

func (s *stubSurveyServiceCounterBoard) SubmitGuestResponse(context.Context, string, string, string, string, json.RawMessage) error {
	panic("unexpected SubmitGuestResponse")
}

func (s *stubSurveyServiceCounterBoard) SubmitKioskPostServiceResponse(context.Context, string, *models.Ticket, int, string) error {
	panic("unexpected SubmitKioskPostServiceResponse")
}

func (s *stubSurveyServiceCounterBoard) CompanyIDForUnit(string) (string, error) {
	panic("unexpected CompanyIDForUnit")
}

func (s *stubSurveyServiceCounterBoard) EnsureGuestSurveyUploadAccess(string, string) error {
	panic("unexpected EnsureGuestSurveyUploadAccess")
}

func (s *stubSurveyServiceCounterBoard) EnsureIdleMediaFileDeletable(string, string) error {
	panic("unexpected EnsureIdleMediaFileDeletable")
}

func (s *stubSurveyServiceCounterBoard) EnsureCompletionImageRead(string, string, string, string, string) error {
	panic("unexpected EnsureCompletionImageRead")
}

func counterBoardSessionRequest(unitID, terminalID string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("unitId", unitID)
	ctx := context.WithValue(context.Background(), chi.RouteCtxKey, rctx)
	if terminalID != "" {
		ctx = context.WithValue(ctx, authmiddleware.UserIDKey, terminalID)
	}
	return httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
}

func TestCounterBoardHandler_Session_Unauthorized(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{})
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.Session(rec, r)
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusUnauthorized)
	}
}

func TestCounterBoardHandler_Session_Forbidden(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(context.Context, string, string) (*services.CounterBoardSession, error) {
			return nil, services.ErrSurveyForbidden
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusForbidden)
	}
	b, _ := io.ReadAll(res.Body)
	if string(b) != "Forbidden\n" {
		t.Fatalf("body %q want %q", string(b), "Forbidden\n")
	}
}

func TestCounterBoardHandler_Session_BadRequest(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(context.Context, string, string) (*services.CounterBoardSession, error) {
			return nil, services.ErrSurveyBadRequest
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusBadRequest)
	}
}

func TestCounterBoardHandler_Session_NotFound(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(context.Context, string, string) (*services.CounterBoardSession, error) {
			return nil, services.ErrSurveyNotFound
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusNotFound)
	}
}

func TestCounterBoardHandler_Session_FeatureLocked(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(context.Context, string, string) (*services.CounterBoardSession, error) {
			return nil, services.ErrSurveyFeatureLocked
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusForbidden)
	}
	b, _ := io.ReadAll(res.Body)
	if string(b) != "Feature not enabled\n" {
		t.Fatalf("body %q want %q", string(b), "Feature not enabled\n")
	}
}

func TestCounterBoardHandler_Session_InternalError(t *testing.T) {
	t.Parallel()
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(context.Context, string, string) (*services.CounterBoardSession, error) {
			return nil, errors.New("db down")
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusInternalServerError)
	}
}

func TestCounterBoardHandler_Session_OK(t *testing.T) {
	t.Parallel()
	want := &services.CounterBoardSession{
		CounterID:      "c1",
		CounterName:    "Desk",
		CounterStaffed: true,
		OnBreak:        false,
	}
	h := NewCounterBoardHandler(&stubSurveyServiceCounterBoard{
		counterBoardSession: func(_ context.Context, unitID, terminalID string) (*services.CounterBoardSession, error) {
			if unitID != "unit-1" || terminalID != "term-1" {
				t.Fatalf("args unitID=%q terminalID=%q", unitID, terminalID)
			}
			return want, nil
		},
	})
	rec := httptest.NewRecorder()
	h.Session(rec, counterBoardSessionRequest("unit-1", "term-1"))
	res := rec.Result()
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d want %d", res.StatusCode, http.StatusOK)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type %q", ct)
	}
	var got services.CounterBoardSession
	if err := json.NewDecoder(res.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.CounterID != want.CounterID || got.CounterName != want.CounterName {
		t.Fatalf("got %+v want %+v", got, want)
	}
	if got.CounterStaffed != want.CounterStaffed || got.OnBreak != want.OnBreak {
		t.Fatalf("staffed/onBreak got %+v", got)
	}
}
