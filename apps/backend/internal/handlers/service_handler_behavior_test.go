package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"
)

type serviceHandlerBehaviorUserRepo struct{ testsupport.PanicUserRepo }

func (serviceHandlerBehaviorUserRepo) IsAdminOrHasUnitAccess(string, string) (bool, error) {
	return true, nil
}

type serviceHandlerBehaviorService struct {
	createErr error
	created   *models.Service
	existing  *models.Service
	updated   *models.Service
}

func (s *serviceHandlerBehaviorService) CreateService(service *models.Service) error {
	s.created = service
	return s.createErr
}
func (*serviceHandlerBehaviorService) GetServicesByUnit(string) ([]models.Service, error) {
	return nil, nil
}
func (s *serviceHandlerBehaviorService) GetServiceByID(string) (*models.Service, error) {
	if s.existing == nil {
		return nil, errors.New("not implemented")
	}
	return s.existing, nil
}
func (s *serviceHandlerBehaviorService) UpdateService(service *models.Service) error {
	s.updated = service
	return nil
}
func (*serviceHandlerBehaviorService) DeleteService(string) error { return nil }

func serviceHandlerBehaviorRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/services", strings.NewReader(body))
	return req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "user-1"))
}

func TestServiceHandlerUpdateService_BodyTooLarge(t *testing.T) {
	stub := &serviceHandlerBehaviorService{existing: &models.Service{ID: "service-1", UnitID: "unit-1", Name: "Existing"}}
	h := NewServiceHandler(stub, serviceHandlerBehaviorUserRepo{})
	body := `{"padding":"` + strings.Repeat("x", 256*1024) + `"}`
	req := httptest.NewRequest(http.MethodPut, "/services/service-1", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.UpdateService(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body = %q", w.Code, w.Body.String())
	}
	if stub.updated != nil {
		t.Fatal("oversized update reached the service layer")
	}
}

func TestServiceHandlerCreateService_BehaviorValidationAndBodyBounds(t *testing.T) {
	t.Run("service validation errors map to bad request", func(t *testing.T) {
		stub := &serviceHandlerBehaviorService{createErr: services.ErrServiceBehaviorInvalid}
		h := NewServiceHandler(stub, serviceHandlerBehaviorUserRepo{})
		w := httptest.NewRecorder()
		h.CreateService(w, serviceHandlerBehaviorRequest(`{"unitId":"unit-1","behavior":{"version":2}}`))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %q", w.Code, w.Body.String())
		}
	})

	t.Run("malformed JSON maps to bad request", func(t *testing.T) {
		stub := &serviceHandlerBehaviorService{}
		h := NewServiceHandler(stub, serviceHandlerBehaviorUserRepo{})
		w := httptest.NewRecorder()
		h.CreateService(w, serviceHandlerBehaviorRequest(`{"unitId":`))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %q", w.Code, w.Body.String())
		}
	})

	t.Run("body larger than 256 KiB maps to payload too large before service invocation", func(t *testing.T) {
		stub := &serviceHandlerBehaviorService{}
		h := NewServiceHandler(stub, serviceHandlerBehaviorUserRepo{})
		body := `{"unitId":"unit-1","padding":"` + strings.Repeat("x", 256*1024) + `"}`
		w := httptest.NewRecorder()
		h.CreateService(w, serviceHandlerBehaviorRequest(body))
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("status = %d, body = %q", w.Code, w.Body.String())
		}
		if stub.created != nil {
			t.Fatal("oversized request reached the service layer")
		}
	})
}

func TestServiceHandlerCreateService_CanonicalizesAbsentAndNullBehavior(t *testing.T) {
	for _, tt := range []struct {
		name         string
		body         string
		wantBehavior bool
	}{
		{name: "omitted", body: `{"unitId":"unit-1","name":"Service"}`},
		{name: "null", body: `{"unitId":"unit-1","name":"Service","behavior":null}`},
		{name: "object", body: `{"unitId":"unit-1","name":"Service","behavior":{"version":1}}`, wantBehavior: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			stub := &serviceHandlerBehaviorService{}
			h := NewServiceHandler(stub, serviceHandlerBehaviorUserRepo{})
			w := httptest.NewRecorder()
			h.CreateService(w, serviceHandlerBehaviorRequest(tt.body))
			if w.Code != http.StatusCreated {
				t.Fatalf("status = %d, body = %q", w.Code, w.Body.String())
			}
			if (stub.created.Behavior != nil) != tt.wantBehavior {
				t.Fatalf("created behavior present = %v, want %v", stub.created.Behavior != nil, tt.wantBehavior)
			}

			var response map[string]json.RawMessage
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			behavior, behaviorPresent := response["behavior"]
			if tt.wantBehavior && (!behaviorPresent || string(behavior) == "null") {
				t.Fatalf("response behavior = %s, want object", behavior)
			}
			if !tt.wantBehavior && behaviorPresent {
				t.Fatalf("response behavior = %s, want omitted", behavior)
			}
		})
	}
}
