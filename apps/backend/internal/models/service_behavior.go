package models

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"
)

// ServiceBehavior is the versioned portable station-flow configuration stored
// in services.behavior. RawJSON preserves the original JSON for strict service
// validation while the exported fields provide an exact API/OpenAPI contract.
type ServiceBehavior struct {
	Version           int                          `json:"version" enums:"1" binding:"required"`
	Information       *ServiceBehaviorInformation  `json:"information,omitempty"`
	Fields            []ServiceBehaviorField       `json:"fields,omitempty"`
	DataRetentionDays *int                         `json:"dataRetentionDays,omitempty" minimum:"1" maximum:"30"`
	Route             *ServiceBehaviorRoute        `json:"route,omitempty"`
	Access            *ServiceBehaviorAccessPolicy `json:"access,omitempty"`

	raw json.RawMessage
}

type ServiceBehaviorLocalizedText map[string]string

type ServiceBehaviorInformation struct {
	Body                   ServiceBehaviorLocalizedText `json:"body" binding:"required"`
	RequireAcknowledgement *bool                        `json:"requireAcknowledgement,omitempty"`
}

type ServiceBehaviorField struct {
	Key      string                        `json:"key" binding:"required"`
	Label    ServiceBehaviorLocalizedText  `json:"label" binding:"required"`
	Type     string                        `json:"type" enums:"text,number,phone,checkbox,select" binding:"required"`
	Required bool                          `json:"required" binding:"required"`
	Options  []ServiceBehaviorSelectOption `json:"options,omitempty"`
}

type ServiceBehaviorSelectOption struct {
	Key   string                       `json:"key" binding:"required"`
	Label ServiceBehaviorLocalizedText `json:"label" binding:"required"`
}

type ServiceBehaviorRoute struct {
	Mode string `json:"mode" enums:"auto,page-slot" binding:"required"`
	Slot string `json:"slot,omitempty" enums:"service-info,service-form,identity,confirmation"`
}

// ServiceBehaviorAccessPolicy and ServiceBehaviorCondition represent the
// canonical Task 2 condition object. The service validator enforces its field,
// operator, and value union; no expression strings are accepted.
type ServiceBehaviorAccessPolicy struct {
	When      ServiceBehaviorCondition `json:"when" binding:"required"`
	WhenFalse string                   `json:"whenFalse" enums:"hide,lock" binding:"required"`
}

type ServiceBehaviorCondition struct {
	Kind       string                     `json:"kind" enums:"rule,group" binding:"required"`
	Field      string                     `json:"field,omitempty" enums:"identity.isAuthenticated,identity.isEmployee,identity.groups,live.queueLength,live.isOpen,live.isConnected,session.selectedServiceId"`
	Operator   string                     `json:"operator,omitempty" enums:"eq,ne,gt,gte,lt,lte,contains,not-contains,is-true,is-false"`
	Value      any                        `json:"value,omitempty"`
	Combinator string                     `json:"combinator,omitempty" enums:"and,or"`
	Children   []ServiceBehaviorCondition `json:"children,omitempty"`
}

// ParseServiceBehaviorJSON turns a non-null JSON behavior into its nullable
// model value. Validation remains in the service layer so handlers do not
// contain business rules.
func ParseServiceBehaviorJSON(raw json.RawMessage) (*ServiceBehavior, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, nil
	}
	var behavior ServiceBehavior
	if err := json.Unmarshal(trimmed, &behavior); err != nil {
		return nil, err
	}
	return &behavior, nil
}

func (b *ServiceBehavior) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*b = ServiceBehavior{raw: append(json.RawMessage(nil), trimmed...)}
		return nil
	}
	// Keep numerical forms such as 1.0 and 1e0 intact for the service
	// validator. Decoding into the documented integer fields here would reject
	// those mathematically integral JSON values before validation can apply the
	// shared TypeScript/Go semantics.
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil || object == nil {
		if err != nil {
			return err
		}
		return fmt.Errorf("service behavior must be a JSON object")
	}
	*b = ServiceBehavior{raw: append(json.RawMessage(nil), trimmed...)}
	return nil
}

func (b ServiceBehavior) MarshalJSON() ([]byte, error) {
	if len(bytes.TrimSpace(b.raw)) > 0 {
		return append([]byte(nil), b.raw...), nil
	}
	type serviceBehaviorAlias ServiceBehavior
	return json.Marshal(serviceBehaviorAlias(b))
}

// RawJSON returns a copy suitable for strict validation without exposing a
// mutable backing slice to callers.
func (b *ServiceBehavior) RawJSON() json.RawMessage {
	if b == nil {
		return nil
	}
	if len(bytes.TrimSpace(b.raw)) > 0 {
		return append(json.RawMessage(nil), b.raw...)
	}
	raw, err := json.Marshal(*b)
	if err != nil {
		return nil
	}
	return raw
}

// CanonicalServiceBehavior converts empty and JSON-null behavior values to
// nil so storage uses SQL NULL and API responses omit behavior rather than
// exposing behavior:null.
func CanonicalServiceBehavior(behavior *ServiceBehavior) *ServiceBehavior {
	if behavior == nil {
		return nil
	}
	trimmed := bytes.TrimSpace(behavior.RawJSON())
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	return behavior
}

func (b *ServiceBehavior) Scan(value any) error {
	if value == nil {
		*b = ServiceBehavior{}
		return nil
	}
	var raw []byte
	switch typed := value.(type) {
	case []byte:
		raw = typed
	case string:
		raw = []byte(typed)
	default:
		return fmt.Errorf("scan service behavior: unsupported type %T", value)
	}
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		*b = ServiceBehavior{raw: append(json.RawMessage(nil), raw...)}
		return nil
	}
	return json.Unmarshal(raw, b)
}

func (b ServiceBehavior) Value() (driver.Value, error) {
	raw := bytes.TrimSpace(b.RawJSON())
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return nil, nil
	}
	return raw, nil
}

// AfterFind covers legacy rows that may still contain JSON null rather than
// SQL NULL and guarantees response canonicalization after repository reads.
func (s *Service) AfterFind(*gorm.DB) error {
	s.Behavior = CanonicalServiceBehavior(s.Behavior)
	return nil
}
