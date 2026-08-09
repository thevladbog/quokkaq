package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

const validServiceBehaviorJSON = `{
  "version": 1,
  "information": {"body": {"en": "Bring your badge"}, "requireAcknowledgement": true},
  "fields": [
    {"key": "room", "label": {"en": "Room"}, "type": "text", "required": true},
    {"key": "reason", "label": {"en": "Reason"}, "type": "select", "required": false, "options": [{"key":"consultation","label":{"en":"Consultation"}}]}
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
		{name: "JSON null behavior", raw: "null", want: nil},
		{name: "invalid json", raw: `{`, want: ErrServiceBehaviorInvalid},
		{name: "unsupported version", raw: `{"version":2}`, want: ErrServiceBehaviorInvalid},
		{name: "duplicate field key", raw: `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true},{"key":"room","label":{"en":"Second room"},"type":"number","required":false}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "select without options", raw: `{"version":1,"fields":[{"key":"reason","label":{"en":"Reason"},"type":"select","required":true}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "select option without stable key", raw: `{"version":1,"fields":[{"key":"reason","label":{"en":"Reason"},"type":"select","required":true,"options":[{"en":"Consultation"}]}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "duplicate select option key", raw: `{"version":1,"fields":[{"key":"reason","label":{"en":"Reason"},"type":"select","required":true,"options":[{"key":"consultation","label":{"en":"Consultation"}},{"key":"consultation","label":{"en":"Again"}}]}],"dataRetentionDays":1}`, want: ErrServiceBehaviorInvalid},
		{name: "incompatible condition operator", raw: `{"version":1,"access":{"when":{"kind":"rule","field":"identity.groups","operator":"gt","value":1},"whenFalse":"lock"}}`, want: ErrServiceBehaviorInvalid},
		{name: "null numeric condition value", raw: `{"version":1,"access":{"when":{"kind":"rule","field":"live.queueLength","operator":"gt","value":null},"whenFalse":"lock"}}`, want: ErrServiceBehaviorInvalid},
		{name: "canonical integral JSON forms", raw: `{"version":1e0,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":1.0}`, want: nil},
		{name: "fractional retention", raw: `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":1.5}`, want: ErrServiceBehaviorInvalid},
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

func TestServiceBehaviorModelDecodingAcceptsIntegralJSONForms(t *testing.T) {
	var service models.Service
	if err := json.Unmarshal([]byte(`{"unitId":"unit-1","behavior":{"version":1e0,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":1.0}}`), &service); err != nil {
		t.Fatalf("service JSON decode rejected integral behavior numbers: %v", err)
	}
	if err := ValidateServiceBehaviorJSON(service.Behavior.RawJSON()); err != nil {
		t.Fatalf("decoded behavior failed validation: %v", err)
	}
}

func TestValidateServiceBehaviorJSON_resourceBounds(t *testing.T) {
	validField := func(key string) map[string]any {
		return map[string]any{"key": key, "label": map[string]any{"en": "Room"}, "type": "text", "required": false}
	}
	fields := make([]any, 51)
	for i := range fields {
		fields[i] = validField(fmt.Sprintf("field_%d", i))
	}
	localizedNine := map[string]any{}
	for i := 0; i < 9; i++ {
		localizedNine[fmt.Sprintf("l%d", i)] = "Room"
	}
	tooManyOptions := make([]any, 51)
	for i := range tooManyOptions {
		tooManyOptions[i] = map[string]any{"key": fmt.Sprintf("option_%d", i), "label": map[string]any{"en": "Option"}}
	}
	deep := conditionGroupAtDepth(9)
	tooManyChildren := make([]any, 21)
	for i := range tooManyChildren {
		tooManyChildren[i] = map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}
	}
	tooManyNodes := make([]any, 20)
	for groupIndex := range tooManyNodes {
		rules := make([]any, 4)
		for ruleIndex := range rules {
			rules[ruleIndex] = map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}
		}
		tooManyNodes[groupIndex] = map[string]any{"kind": "group", "combinator": "or", "children": rules}
	}

	tests := []struct {
		name     string
		behavior map[string]any
		want     error
	}{
		{name: "at field bound", behavior: map[string]any{"version": 1, "fields": []any{validField("room")}, "dataRetentionDays": 1}, want: nil},
		{name: "more than 50 fields", behavior: map[string]any{"version": 1, "fields": fields, "dataRetentionDays": 1}, want: ErrServiceBehaviorInvalid},
		{name: "more than eight localized entries", behavior: map[string]any{"version": 1, "fields": []any{map[string]any{"key": "room", "label": localizedNine, "type": "text", "required": true}}, "dataRetentionDays": 1}, want: ErrServiceBehaviorInvalid},
		{name: "locale key longer than sixteen", behavior: map[string]any{"version": 1, "fields": []any{map[string]any{"key": "room", "label": map[string]any{"this_locale_key_is_too_long": "Room"}, "type": "text", "required": true}}, "dataRetentionDays": 1}, want: ErrServiceBehaviorInvalid},
		{name: "field label longer than 160", behavior: map[string]any{"version": 1, "fields": []any{map[string]any{"key": "room", "label": map[string]any{"en": strings.Repeat("a", 161)}, "type": "text", "required": true}}, "dataRetentionDays": 1}, want: ErrServiceBehaviorInvalid},
		{name: "information body longer than 4000", behavior: map[string]any{"version": 1, "information": map[string]any{"body": map[string]any{"en": strings.Repeat("a", 4001)}}, "fields": []any{}}, want: ErrServiceBehaviorInvalid},
		{name: "more than 50 select options", behavior: map[string]any{"version": 1, "fields": []any{map[string]any{"key": "reason", "label": map[string]any{"en": "Reason"}, "type": "select", "required": false, "options": tooManyOptions}}, "dataRetentionDays": 1}, want: ErrServiceBehaviorInvalid},
		{name: "access deeper than eight nodes", behavior: map[string]any{"version": 1, "access": map[string]any{"when": deep, "whenFalse": "hide"}}, want: ErrServiceBehaviorInvalid},
		{name: "access at depth eight", behavior: map[string]any{"version": 1, "access": map[string]any{"when": conditionGroupAtDepth(7), "whenFalse": "hide"}}, want: nil},
		{name: "access with more than 100 nodes", behavior: map[string]any{"version": 1, "access": map[string]any{"when": map[string]any{"kind": "group", "combinator": "or", "children": tooManyNodes}, "whenFalse": "hide"}}, want: ErrServiceBehaviorInvalid},
		{name: "access group with more than 20 children", behavior: map[string]any{"version": 1, "access": map[string]any{"when": map[string]any{"kind": "group", "combinator": "and", "children": tooManyChildren}, "whenFalse": "hide"}}, want: ErrServiceBehaviorInvalid},
		{name: "access at 100 nodes", behavior: map[string]any{"version": 1, "access": map[string]any{"when": conditionAtOneHundredNodes(), "whenFalse": "hide"}}, want: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := json.Marshal(tt.behavior)
			if err != nil {
				t.Fatal(err)
			}
			err = ValidateServiceBehaviorJSON(raw)
			if !errors.Is(err, tt.want) {
				t.Fatalf("ValidateServiceBehaviorJSON() error = %v, want %v", err, tt.want)
			}
		})
	}

	atLimit := serviceBehaviorJSONAtSize(t, 64*1024)
	if len(atLimit) != 64*1024 {
		t.Fatalf("atLimit length = %d", len(atLimit))
	}
	if err := ValidateServiceBehaviorJSON(atLimit); err != nil {
		t.Fatalf("at-limit behavior rejected: %v", err)
	}
	aboveLimit := serviceBehaviorJSONAtSize(t, 64*1024+1)
	if err := ValidateServiceBehaviorJSON(aboveLimit); !errors.Is(err, ErrServiceBehaviorInvalid) {
		t.Fatalf("above-limit behavior error = %v", err)
	}
}

func conditionGroupAtDepth(groups int) map[string]any {
	var node any = map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}
	for i := 0; i < groups; i++ {
		node = map[string]any{"kind": "group", "combinator": "and", "children": []any{node}}
	}
	return node.(map[string]any)
}

func conditionAtOneHundredNodes() map[string]any {
	children := make([]any, 20)
	for groupIndex := range children {
		ruleCount := 4
		if groupIndex == 19 {
			ruleCount = 3
		}
		rules := make([]any, ruleCount)
		for ruleIndex := range rules {
			rules[ruleIndex] = map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}
		}
		children[groupIndex] = map[string]any{"kind": "group", "combinator": "or", "children": rules}
	}
	return map[string]any{"kind": "group", "combinator": "or", "children": children}
}

func serviceBehaviorJSONAtSize(t *testing.T, size int) json.RawMessage {
	t.Helper()
	localized := map[string]any{}
	for i := 0; i < 8; i++ {
		localized[fmt.Sprintf("l%d", i)] = strings.Repeat("x", 160)
	}
	fields := make([]any, 22)
	for i := range fields {
		fields[i] = map[string]any{
			"key":      fmt.Sprintf("field_%d", i),
			"label":    localized,
			"type":     "select",
			"required": false,
			"options":  []any{map[string]any{"key": "option", "label": localized}},
		}
	}
	behavior := map[string]any{
		"version":     1,
		"information": map[string]any{"body": map[string]any{"en": "x"}},
		"route":       map[string]any{"mode": "auto"},
		"access": map[string]any{
			"when":      map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"},
			"whenFalse": "hide",
		},
		"fields":            fields,
		"dataRetentionDays": 1,
	}
	base, err := json.Marshal(behavior)
	if err != nil {
		t.Fatal(err)
	}
	padding := size - len(base)
	if padding < 0 || padding+1 > 4000 {
		t.Fatalf("cannot construct %d-byte behavior; padding=%d", size, padding)
	}
	behavior["information"] = map[string]any{"body": map[string]any{"en": strings.Repeat("x", padding+1)}}
	out, err := json.Marshal(behavior)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestServiceBehaviorValidationRunsBeforeCreateAndUpdatePersistence(t *testing.T) {
	invalid, err := models.ParseServiceBehaviorJSON(json.RawMessage(`{"version":2}`))
	if err != nil {
		t.Fatal(err)
	}

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
