package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
)

// postVisitorSkipTicketSvc is a test double for the single route PostVisitorSMSSkip.
type postVisitorSkipTicketSvc struct {
	getByID func(id string) (*models.Ticket, error)
}

func (m *postVisitorSkipTicketSvc) CreateTicket(string, string, *string, *string, *string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) CreateTicketWithPreRegistration(string, string, string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) GetTicketByID(id string) (*models.Ticket, error) {
	if m.getByID != nil {
		return m.getByID(id)
	}
	return nil, errors.New("not found")
}
func (m *postVisitorSkipTicketSvc) GetTicketsByUnit(string) ([]models.Ticket, error) { return nil, nil }
func (m *postVisitorSkipTicketSvc) Recall(string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) Pick(string, string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) Transfer(string, services.TransferTicketInput, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) ReturnToQueue(string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) CallNext(string, string, []string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) UpdateOperatorComment(string, *string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) UpdateStatus(string, string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) UpdateTicketVisitor(string, services.PatchTicketVisitorInput, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) SetVisitorTagsForTicket(string, []string, string, *string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) ListVisitsByClient(string, string, int, *string) ([]models.Ticket, *string, error) {
	return nil, nil, nil
}
func (m *postVisitorSkipTicketSvc) VisitorCancelTicket(string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) AttachPhoneToTicket(string, string, string) (*models.Ticket, error) {
	return nil, errors.New("unimplemented")
}
func (m *postVisitorSkipTicketSvc) SetNotificationService(*services.NotificationService) {}

var _ services.TicketService = (*postVisitorSkipTicketSvc)(nil)

func newChiPOST(path string, h http.HandlerFunc) http.Handler {
	r := chi.NewRouter()
	r.Post(path, h)
	return r
}

func TestPostVisitorSMSSkip_BadRequestEmptyID(t *testing.T) {
	t.Parallel()
	svc := &postVisitorSkipTicketSvc{}
	h := &TicketHandler{service: svc}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "   ")
	req := httptest.NewRequest(http.MethodPost, "/tickets/placeholder/visitor-sms-skip", nil)
	req.Header.Set("X-Visitor-Token", "tok")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.PostVisitorSMSSkip(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 400", w.Code)
	}
}

func TestPostVisitorSMSSkip_UnauthorizedNoHeader(t *testing.T) {
	t.Parallel()
	svc := &postVisitorSkipTicketSvc{}
	h := &TicketHandler{service: svc}
	router := newChiPOST("/tickets/{id}/visitor-sms-skip", h.PostVisitorSMSSkip)
	req := httptest.NewRequest(http.MethodPost, "/tickets/t-1/visitor-sms-skip", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("code = %d, want 401", w.Code)
	}
}

func TestPostVisitorSMSSkip_NotFound(t *testing.T) {
	t.Parallel()
	svc := &postVisitorSkipTicketSvc{
		getByID: func(id string) (*models.Ticket, error) { return nil, errors.New("missing") },
	}
	h := &TicketHandler{service: svc}
	router := newChiPOST("/tickets/{id}/visitor-sms-skip", h.PostVisitorSMSSkip)
	req := httptest.NewRequest(http.MethodPost, "/tickets/unknown/visitor-sms-skip", nil)
	req.Header.Set("X-Visitor-Token", "ok")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("code = %d, want 404", w.Code)
	}
}

func TestPostVisitorSMSSkip_UnauthorizedWrongToken(t *testing.T) {
	t.Parallel()
	svc := &postVisitorSkipTicketSvc{
		getByID: func(id string) (*models.Ticket, error) {
			return &models.Ticket{ID: id, VisitorToken: "secret", UnitID: "u1"}, nil
		},
	}
	h := &TicketHandler{service: svc}
	router := newChiPOST("/tickets/{id}/visitor-sms-skip", h.PostVisitorSMSSkip)
	req := httptest.NewRequest(http.MethodPost, "/tickets/tok-test/visitor-sms-skip", nil)
	req.Header.Set("X-Visitor-Token", "wrong")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("code = %d, want 401", w.Code)
	}
}

func TestPostVisitorSMSSkip_NoContent(t *testing.T) {
	t.Parallel()
	svc := &postVisitorSkipTicketSvc{
		getByID: func(id string) (*models.Ticket, error) {
			return &models.Ticket{ID: id, VisitorToken: "good", UnitID: "u1"}, nil
		},
	}
	h := &TicketHandler{service: svc}
	router := newChiPOST("/tickets/{id}/visitor-sms-skip", h.PostVisitorSMSSkip)
	req := httptest.NewRequest(http.MethodPost, "/tickets/abc/visitor-sms-skip", nil)
	req.Header.Set("X-Visitor-Token", "good")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Errorf("code = %d, want 204", w.Code)
	}
}
