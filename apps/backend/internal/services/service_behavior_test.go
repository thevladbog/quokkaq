package services

import (
	"encoding/json"
	"errors"
	"testing"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

const validServiceBehaviorJSON = `{
  "version": 1,
  "information": {"body": {"en": "Bring your badge"}, "requireAcknowledgement": true},
  "fields": [
    {"key": "room", "label": {"en": "Room"}, "type": "text", "required": true},
    {"key": "reason", "label": {"en": "Reason"}, "type": "select", "required": false, "options": [{"en": "Consultation"}]}
  ],
  "dataRetentionDays": 7,
  "route": {"mode": "page-slot", "slot": "service-form"},
  "access": {"when": {"kind": "rule", "field": "identity.isAuthenticated", "operator": "is-true"}, "whenFalse": "lock"}
}`

func TestValidateServiceBehaviorJSON(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want error
	}{
		{name: "absent behavior", raw: "", want: nil},
		{name: "invalid json", raw: `{`, want: ErrServiceBehaviorInvalid},
		{name: "unsupported version", raw: `{"version":2}`, want: ErrServiceBehaviorInvalid},
		{name: "duplicate field key", raw: `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true},{"key":"room","label":{"en":"Second room"},"type":"number","required":false}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "select without options", raw: `{"version":1,"fields":[{"key":"reason","label":{"en":"Reason"},"type":"select","required":true}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "incompatible condition operator", raw: `{"version":1,"access":{"when":{"kind":"rule","field":"identity.groups","operator":"gt","value":1},"whenFalse":"lock"}}`, want: ErrServiceBehaviorInvalid},
		{name: "null numeric condition value", raw: `{"version":1,"access":{"when":{"kind":"rule","field":"live.queueLength","operator":"gt","value":null},"whenFalse":"lock"}}`, want: ErrServiceBehaviorInvalid},
		{name: "valid behavior", raw: validServiceBehaviorJSON, want: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateServiceBehaviorJSON(json.RawMessage(tt.raw))
			if !errors.Is(err, tt.want) {
				t.Fatalf("ValidateServiceBehaviorJSON() error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestServiceBehaviorValidationRunsBeforeCreateAndUpdatePersistence(t *testing.T) {
	invalid := json.RawMessage(`{"version":2}`)

	t.Run("create", func(t *testing.T) {
		service := &models.Service{UnitID: "unit-1", Behavior: invalid}
		err := NewServiceService(nil, nil).CreateService(service)
		if !errors.Is(err, ErrServiceBehaviorInvalid) {
			t.Fatalf("CreateService() error = %v, want %v", err, ErrServiceBehaviorInvalid)
		}
	})

	t.Run("update", func(t *testing.T) {
		repo := &serviceBehaviorTestRepo{
			byID: &models.Service{ID: "service-1", UnitID: "unit-1", Name: "Service"},
		}
		service := &models.Service{ID: "service-1", Behavior: invalid}
		err := NewServiceService(repo, nil).UpdateService(service)
		if !errors.Is(err, ErrServiceBehaviorInvalid) {
			t.Fatalf("UpdateService() error = %v, want %v", err, ErrServiceBehaviorInvalid)
		}
		if repo.updated {
			t.Fatal("UpdateService() persisted an invalid behavior")
		}
	})
}

type serviceBehaviorTestRepo struct {
	byID    *models.Service
	updated bool
}

func (r *serviceBehaviorTestRepo) Create(*models.Service) error { return nil }
func (r *serviceBehaviorTestRepo) CreateTx(*gorm.DB, *models.Service) error {
	return nil
}
func (r *serviceBehaviorTestRepo) NextSortOrderForUnit(string) (int, error) { return 0, nil }
func (r *serviceBehaviorTestRepo) NextSortOrderForUnitTx(*gorm.DB, string) (int, error) {
	return 0, nil
}
func (r *serviceBehaviorTestRepo) FindAllByUnit(string) ([]models.Service, error) { return nil, nil }
func (r *serviceBehaviorTestRepo) FindAllByUnitSubtree(string) ([]models.Service, error) {
	return nil, nil
}
func (r *serviceBehaviorTestRepo) FindByID(string) (*models.Service, error) { return r.byID, nil }
func (r *serviceBehaviorTestRepo) FindByIDTx(*gorm.DB, string) (*models.Service, error) {
	return r.byID, nil
}
func (r *serviceBehaviorTestRepo) FindMapByIDs([]string) (map[string]*models.Service, error) {
	return nil, nil
}
func (r *serviceBehaviorTestRepo) CountByUnitAndIDs(string, []string) (int64, error) {
	return 0, nil
}
func (r *serviceBehaviorTestRepo) CountByUnitSubtreeAndIDs(string, []string) (int64, error) {
	return 0, nil
}
func (r *serviceBehaviorTestRepo) CountByUnitAndCalendarSlotKey(string, string, string) (int64, error) {
	return 0, nil
}
func (r *serviceBehaviorTestRepo) Update(*models.Service) error {
	r.updated = true
	return nil
}
func (r *serviceBehaviorTestRepo) Delete(string) error { return nil }
