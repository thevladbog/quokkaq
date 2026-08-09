package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type screenTemplateHandlerUserRepo struct {
	testsupport.PanicUserRepo
	resolve func(userID, companyHeader string) (string, error)
}

func (r screenTemplateHandlerUserRepo) ResolveCompanyIDForRequest(userID, companyHeader string) (string, error) {
	return r.resolve(userID, companyHeader)
}

type screenTemplateHandlerService struct {
	create   func(companyID, name, surface string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error)
	update   func(companyID, id, name string, definition json.RawMessage, surface *string) (*models.ScreenLayoutTemplate, error)
	publish  func(ctx context.Context, companyID, id, publisherID string) (*models.ExperienceTemplateVersion, error)
	versions func(ctx context.Context, companyID, id string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error)
	restore  func(ctx context.Context, companyID, id, versionID, publisherID string) (*models.ExperienceTemplateVersion, error)
	delete   func(companyID, id string) error
}

func (s screenTemplateHandlerService) List(string) ([]models.ScreenLayoutTemplate, error) {
	panic("unexpected List")
}
func (s screenTemplateHandlerService) Create(companyID, name, surface string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error) {
	if s.create == nil {
		panic("unexpected Create")
	}
	return s.create(companyID, name, surface, definition)
}
func (s screenTemplateHandlerService) Update(companyID, id, name string, definition json.RawMessage, surface *string) (*models.ScreenLayoutTemplate, error) {
	if s.update == nil {
		panic("unexpected Update")
	}
	return s.update(companyID, id, name, definition, surface)
}
func (s screenTemplateHandlerService) Delete(companyID, id string) error {
	if s.delete == nil {
		panic("unexpected Delete")
	}
	return s.delete(companyID, id)
}
func (s screenTemplateHandlerService) Publish(ctx context.Context, companyID, id, publisherID string) (*models.ExperienceTemplateVersion, error) {
	if s.publish == nil {
		panic("unexpected Publish")
	}
	return s.publish(ctx, companyID, id, publisherID)
}
func (s screenTemplateHandlerService) ListVersions(ctx context.Context, companyID, id string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error) {
	if s.versions == nil {
		panic("unexpected ListVersions")
	}
	return s.versions(ctx, companyID, id, beforeVersion, limit)
}
func (s screenTemplateHandlerService) Restore(ctx context.Context, companyID, id, versionID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	if s.restore == nil {
		panic("unexpected Restore")
	}
	return s.restore(ctx, companyID, id, versionID, publisherID)
}

func screenTemplateRequest(method, target, userID string, body []byte, params map[string]string) *http.Request {
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
	return req.WithContext(ctx)
}

func newScreenTemplateHandlerForTest(svc screenTemplateHandlerService) *ScreenLayoutTemplateHandler {
	return NewScreenLayoutTemplateHandler(svc, screenTemplateHandlerUserRepo{
		resolve: func(userID, companyHeader string) (string, error) {
			if userID != "actor" {
				return "", errors.New("wrong actor")
			}
			return "company-a", nil
		},
	})
}

func TestScreenLayoutTemplateHandler_PublishEndpointStatusContract(t *testing.T) {
	publishedAt := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name       string
		serviceErr error
		wantStatus int
		wantBody   string
	}{
		{name: "invalid definition", serviceErr: services.ErrScreenLayoutTemplateInvalidDefinition, wantStatus: http.StatusBadRequest, wantBody: "invalid template definition"},
		{name: "cross tenant is hidden", serviceErr: gorm.ErrRecordNotFound, wantStatus: http.StatusNotFound, wantBody: "Not found"},
		{name: "version conflict", serviceErr: services.ErrExperienceVersionConflict, wantStatus: http.StatusConflict, wantBody: "publish conflict"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
				publish: func(_ context.Context, companyID, id, publisherID string) (*models.ExperienceTemplateVersion, error) {
					if companyID != "company-a" || id != "template-a" || publisherID != "actor" {
						t.Fatalf("publish scope = %q %q %q", companyID, id, publisherID)
					}
					return nil, tt.serviceErr
				},
			})
			recorder := httptest.NewRecorder()
			handler.Publish(recorder, screenTemplateRequest(http.MethodPost, "/", "actor", nil, map[string]string{"templateId": "template-a"}))
			if recorder.Code != tt.wantStatus || !strings.Contains(recorder.Body.String(), tt.wantBody) {
				t.Fatalf("response = %d %q, want %d containing %q", recorder.Code, recorder.Body.String(), tt.wantStatus, tt.wantBody)
			}
			if strings.Contains(recorder.Body.String(), "company-b") {
				t.Fatalf("response leaked tenant data: %q", recorder.Body.String())
			}
		})
	}

	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		publish: func(context.Context, string, string, string) (*models.ExperienceTemplateVersion, error) {
			publisher := "actor"
			return &models.ExperienceTemplateVersion{
				ID: "version-1", TemplateID: "template-a", Version: 1,
				Definition: json.RawMessage(`{"safe":true}`), PublishedBy: &publisher, PublishedAt: publishedAt,
			}, nil
		},
	})
	recorder := httptest.NewRecorder()
	handler.Publish(recorder, screenTemplateRequest(http.MethodPost, "/", "actor", nil, map[string]string{"templateId": "template-a"}))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("publish success status = %d body=%q", recorder.Code, recorder.Body.String())
	}
	var got models.ExperienceTemplateVersion
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != "version-1" || got.Version != 1 {
		t.Fatalf("publish response = %#v", got)
	}
}

func TestScreenLayoutTemplateHandler_ListAndRestoreAreTenantScoped(t *testing.T) {
	publisher := "actor"
	version := models.ExperienceTemplateVersion{ID: "version-1", TemplateID: "template-a", Version: 1, Definition: json.RawMessage(`{}`), PublishedBy: &publisher, PublishedAt: time.Now()}
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		versions: func(_ context.Context, companyID, id string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error) {
			if companyID != "company-a" || id != "template-a" {
				t.Fatalf("versions scope = %q %q", companyID, id)
			}
			if beforeVersion != nil || limit != 20 {
				t.Fatalf("pagination = before %v limit %d", beforeVersion, limit)
			}
			return &models.ExperienceTemplateVersionPage{Items: []models.ExperienceTemplateVersionMetadata{{ID: version.ID, TemplateID: version.TemplateID, Version: version.Version, PublishedBy: version.PublishedBy, PublishedAt: version.PublishedAt}}}, nil
		},
		restore: func(_ context.Context, companyID, id, versionID, publisherID string) (*models.ExperienceTemplateVersion, error) {
			if companyID != "company-a" || id != "template-a" || versionID != "version-1" || publisherID != "actor" {
				t.Fatalf("restore scope = %q %q %q %q", companyID, id, versionID, publisherID)
			}
			copy := version
			copy.ID = "version-2"
			copy.Version = 2
			return &copy, nil
		},
	})

	listRecorder := httptest.NewRecorder()
	handler.ListVersions(listRecorder, screenTemplateRequest(http.MethodGet, "/?limit=20", "actor", nil, map[string]string{"templateId": "template-a"}))
	if listRecorder.Code != http.StatusOK || !strings.Contains(listRecorder.Body.String(), "version-1") {
		t.Fatalf("list response = %d %q", listRecorder.Code, listRecorder.Body.String())
	}
	if strings.Contains(listRecorder.Body.String(), "definition") {
		t.Fatalf("list leaked immutable definition: %q", listRecorder.Body.String())
	}
	restoreRecorder := httptest.NewRecorder()
	handler.Restore(restoreRecorder, screenTemplateRequest(http.MethodPost, "/", "actor", nil, map[string]string{"templateId": "template-a", "versionId": "version-1"}))
	if restoreRecorder.Code != http.StatusCreated || !strings.Contains(restoreRecorder.Body.String(), "version-2") {
		t.Fatalf("restore response = %d %q", restoreRecorder.Code, restoreRecorder.Body.String())
	}
}

func TestScreenLayoutTemplateHandler_ListVersionsValidatesPagination(t *testing.T) {
	called := false
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		versions: func(context.Context, string, string, *int, int) (*models.ExperienceTemplateVersionPage, error) {
			called = true
			return nil, nil
		},
	})
	for _, target := range []string{"/?limit=0", "/?limit=101", "/?limit=wat", "/?beforeVersion=0", "/?beforeVersion=-1", "/?beforeVersion=wat"} {
		t.Run(target, func(t *testing.T) {
			called = false
			recorder := httptest.NewRecorder()
			handler.ListVersions(recorder, screenTemplateRequest(http.MethodGet, target, "actor", nil, map[string]string{"templateId": "template-a"}))
			if recorder.Code != http.StatusBadRequest || called {
				t.Fatalf("response = %d called=%v body=%q, want 400 and no service call", recorder.Code, called, recorder.Body.String())
			}
		})
	}
}

func TestScreenLayoutTemplateHandler_CreateAndUpdateCarrySurfaceContract(t *testing.T) {
	var createSurface string
	var updateSurface *string
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		create: func(companyID, name, surface string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error) {
			createSurface = surface
			return &models.ScreenLayoutTemplate{ID: "template", CompanyID: companyID, Name: name, Surface: "queue-display", Definition: definition}, nil
		},
		update: func(companyID, id, name string, definition json.RawMessage, surface *string) (*models.ScreenLayoutTemplate, error) {
			updateSurface = surface
			return nil, services.ErrScreenLayoutTemplateSurfaceImmutable
		},
	})

	createRecorder := httptest.NewRecorder()
	handler.Create(createRecorder, screenTemplateRequest(http.MethodPost, "/", "actor", []byte(`{"name":"Legacy","definition":{"legacy":true}}`), nil))
	if createRecorder.Code != http.StatusCreated || createSurface != "" {
		t.Fatalf("create = %d surface=%q body=%q", createRecorder.Code, createSurface, createRecorder.Body.String())
	}

	updateRecorder := httptest.NewRecorder()
	handler.Update(updateRecorder, screenTemplateRequest(http.MethodPut, "/", "actor", []byte(`{"name":"Legacy","surface":"ticket-station","definition":{"legacy":true}}`), map[string]string{"templateId": "template"}))
	if updateRecorder.Code != http.StatusConflict || updateSurface == nil || *updateSurface != "ticket-station" {
		t.Fatalf("update = %d surface=%v body=%q", updateRecorder.Code, updateSurface, updateRecorder.Body.String())
	}
}

func TestScreenLayoutTemplateHandler_BoundsCreateAndUpdateBodies(t *testing.T) {
	called := false
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		create: func(string, string, string, json.RawMessage) (*models.ScreenLayoutTemplate, error) {
			called = true
			return nil, nil
		},
		update: func(string, string, string, json.RawMessage, *string) (*models.ScreenLayoutTemplate, error) {
			called = true
			return nil, nil
		},
	})

	oversizedBody := append([]byte(`{"name":"Oversized","definition":{},"padding":"`), bytes.Repeat([]byte("x"), experience.MaxDefinitionBytes+(32<<10))...)
	oversizedBody = append(oversizedBody, []byte(`"}`)...)
	for _, method := range []string{http.MethodPost, http.MethodPut} {
		t.Run(method+" oversized", func(t *testing.T) {
			called = false
			recorder := httptest.NewRecorder()
			params := map[string]string{}
			if method == http.MethodPut {
				params["templateId"] = "template-a"
			}
			request := screenTemplateRequest(method, "/", "actor", oversizedBody, params)
			if method == http.MethodPost {
				handler.Create(recorder, request)
			} else {
				handler.Update(recorder, request)
			}
			if recorder.Code != http.StatusRequestEntityTooLarge {
				t.Fatalf("status = %d body=%q, want 413", recorder.Code, recorder.Body.String())
			}
			if called {
				t.Fatal("service called for oversized body")
			}
		})
	}

	called = false
	recorder := httptest.NewRecorder()
	handler.Create(recorder, screenTemplateRequest(http.MethodPost, "/", "actor", []byte(`{"name":`), nil))
	if recorder.Code != http.StatusBadRequest || called {
		t.Fatalf("malformed response = %d called=%v body=%q, want 400 and no call", recorder.Code, called, recorder.Body.String())
	}
}

func TestScreenLayoutTemplateHandler_MapsDecodedOversizedDefinitionTo413(t *testing.T) {
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		create: func(string, string, string, json.RawMessage) (*models.ScreenLayoutTemplate, error) {
			return nil, services.ErrScreenLayoutTemplateDefinitionTooLarge
		},
	})
	recorder := httptest.NewRecorder()
	handler.Create(recorder, screenTemplateRequest(http.MethodPost, "/", "actor", []byte(`{"name":"Oversized","definition":{}}`), nil))
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d body=%q, want 413", recorder.Code, recorder.Body.String())
	}
}

func TestScreenLayoutTemplateHandler_DeleteAssignedReturnsStable409(t *testing.T) {
	handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
		delete: func(companyID, id string) error {
			if companyID != "company-a" || id != "template-a" {
				t.Fatalf("delete scope = %q %q", companyID, id)
			}
			return services.ErrExperienceTemplateAssigned
		},
	})
	recorder := httptest.NewRecorder()
	handler.Delete(recorder, screenTemplateRequest(http.MethodDelete, "/", "actor", nil, map[string]string{"templateId": "template-a"}))
	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d body=%q, want 409", recorder.Code, recorder.Body.String())
	}
	var response map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response["code"] != "experience_template_assigned" || response["message"] != "experience template is assigned to a terminal" {
		t.Fatalf("response = %#v", response)
	}
}

func TestScreenLayoutTemplateHandler_DeleteUnassignedAndCrossTenantAreDeterministic(t *testing.T) {
	t.Run("unassigned", func(t *testing.T) {
		handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
			delete: func(companyID, id string) error {
				if companyID != "company-a" || id != "template-a" {
					t.Fatalf("delete scope = %q %q", companyID, id)
				}
				return nil
			},
		})
		recorder := httptest.NewRecorder()
		handler.Delete(recorder, screenTemplateRequest(http.MethodDelete, "/", "actor", nil, map[string]string{"templateId": "template-a"}))
		if recorder.Code != http.StatusNoContent || recorder.Body.Len() != 0 {
			t.Fatalf("response = %d %q, want empty 204", recorder.Code, recorder.Body.String())
		}
	})

	t.Run("cross tenant hidden", func(t *testing.T) {
		handler := newScreenTemplateHandlerForTest(screenTemplateHandlerService{
			delete: func(companyID, id string) error {
				if companyID != "company-a" || id != "template-b" {
					t.Fatalf("delete scope = %q %q", companyID, id)
				}
				return gorm.ErrRecordNotFound
			},
		})
		recorder := httptest.NewRecorder()
		handler.Delete(recorder, screenTemplateRequest(http.MethodDelete, "/", "actor", nil, map[string]string{"templateId": "template-b"}))
		if recorder.Code != http.StatusNotFound || strings.Contains(recorder.Body.String(), "template-b") || strings.Contains(recorder.Body.String(), "company") {
			t.Fatalf("response = %d %q, want tenant-safe 404", recorder.Code, recorder.Body.String())
		}
	})
}

var _ repository.UserRepository = screenTemplateHandlerUserRepo{}
