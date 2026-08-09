package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"regexp"
)

// ErrServiceBehaviorInvalid is returned when a service behavior does not match
// the portable Phase 1 contract. It intentionally carries no submitted data.
var ErrServiceBehaviorInvalid = errors.New("service behavior is invalid")

var serviceBehaviorFieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// ValidateServiceBehaviorJSON verifies the portable Service behavior contract.
// Empty and JSON-null values represent the optional legacy-compatible absence of behavior.
func ValidateServiceBehaviorJSON(raw json.RawMessage) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}

	behavior, ok := serviceBehaviorObject(trimmed, map[string]struct{}{
		"version":           {},
		"information":       {},
		"fields":            {},
		"dataRetentionDays": {},
		"route":             {},
		"access":            {},
	})
	if !ok {
		return ErrServiceBehaviorInvalid
	}
	version, ok := serviceBehaviorInt(behavior["version"])
	if !ok || version != 1 {
		return ErrServiceBehaviorInvalid
	}

	if rawInformation, exists := behavior["information"]; exists && !validateServiceBehaviorInformation(rawInformation) {
		return ErrServiceBehaviorInvalid
	}

	fields := []json.RawMessage{}
	if rawFields, exists := behavior["fields"]; exists {
		var fieldsOK bool
		fields, fieldsOK = serviceBehaviorArray(rawFields)
		if !fieldsOK {
			return ErrServiceBehaviorInvalid
		}
	}
	seenKeys := make(map[string]struct{}, len(fields))
	for _, rawField := range fields {
		key, ok := validateServiceBehaviorField(rawField)
		if !ok {
			return ErrServiceBehaviorInvalid
		}
		if _, duplicate := seenKeys[key]; duplicate {
			return ErrServiceBehaviorInvalid
		}
		seenKeys[key] = struct{}{}
	}

	if rawRetention, exists := behavior["dataRetentionDays"]; exists {
		retention, valid := serviceBehaviorInt(rawRetention)
		if !valid || retention < 1 || retention > 30 {
			return ErrServiceBehaviorInvalid
		}
	} else if len(fields) > 0 {
		return ErrServiceBehaviorInvalid
	}

	if rawRoute, exists := behavior["route"]; exists && !validateServiceBehaviorRoute(rawRoute) {
		return ErrServiceBehaviorInvalid
	}
	if rawAccess, exists := behavior["access"]; exists && !validateServiceBehaviorAccess(rawAccess) {
		return ErrServiceBehaviorInvalid
	}

	return nil
}

func validateServiceBehaviorInformation(raw json.RawMessage) bool {
	information, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"body":                   {},
		"requireAcknowledgement": {},
	})
	if !ok {
		return false
	}
	body, ok := information["body"]
	if !ok || !validateServiceBehaviorLocalizedText(body) {
		return false
	}
	if rawAcknowledgement, exists := information["requireAcknowledgement"]; exists {
		if _, valid := serviceBehaviorBool(rawAcknowledgement); !valid {
			return false
		}
	}
	return true
}

func validateServiceBehaviorField(raw json.RawMessage) (string, bool) {
	field, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"key":      {},
		"label":    {},
		"type":     {},
		"required": {},
		"options":  {},
	})
	if !ok {
		return "", false
	}
	key, valid := serviceBehaviorString(field["key"])
	if !valid || !serviceBehaviorFieldKeyPattern.MatchString(key) {
		return "", false
	}
	label, hasLabel := field["label"]
	if !hasLabel || !validateServiceBehaviorLocalizedText(label) {
		return "", false
	}
	if _, valid := serviceBehaviorBool(field["required"]); !valid {
		return "", false
	}
	fieldType, valid := serviceBehaviorString(field["type"])
	if !valid {
		return "", false
	}

	rawOptions, hasOptions := field["options"]
	switch fieldType {
	case "text", "number", "phone", "checkbox":
		return key, !hasOptions
	case "select":
		if !hasOptions {
			return "", false
		}
		options, valid := serviceBehaviorArray(rawOptions)
		if !valid || len(options) < 1 || len(options) > 50 {
			return "", false
		}
		for _, option := range options {
			if !validateServiceBehaviorLocalizedText(option) {
				return "", false
			}
		}
		return key, true
	default:
		return "", false
	}
}

func validateServiceBehaviorRoute(raw json.RawMessage) bool {
	route, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"mode": {},
		"slot": {},
	})
	if !ok {
		return false
	}
	mode, valid := serviceBehaviorString(route["mode"])
	if !valid {
		return false
	}
	switch mode {
	case "auto":
		_, hasSlot := route["slot"]
		return !hasSlot
	case "page-slot":
		slot, valid := serviceBehaviorString(route["slot"])
		if !valid {
			return false
		}
		switch slot {
		case "service-info", "service-form", "identity", "confirmation":
			return true
		default:
			return false
		}
	default:
		return false
	}
}

func validateServiceBehaviorAccess(raw json.RawMessage) bool {
	access, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"when":      {},
		"whenFalse": {},
	})
	if !ok {
		return false
	}
	when, hasWhen := access["when"]
	whenFalse, valid := serviceBehaviorString(access["whenFalse"])
	if !hasWhen || !valid || (whenFalse != "hide" && whenFalse != "lock") {
		return false
	}
	return validateServiceBehaviorCondition(when)
}

func validateServiceBehaviorCondition(raw json.RawMessage) bool {
	condition, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"kind":       {},
		"field":      {},
		"operator":   {},
		"value":      {},
		"combinator": {},
		"children":   {},
	})
	if !ok {
		return false
	}
	kind, valid := serviceBehaviorString(condition["kind"])
	if !valid {
		return false
	}
	switch kind {
	case "rule":
		return validateServiceBehaviorConditionRule(condition)
	case "group":
		return validateServiceBehaviorConditionGroup(condition)
	default:
		return false
	}
}

func validateServiceBehaviorConditionRule(rule map[string]json.RawMessage) bool {
	for key := range rule {
		if key != "kind" && key != "field" && key != "operator" && key != "value" {
			return false
		}
	}
	field, valid := serviceBehaviorString(rule["field"])
	if !valid {
		return false
	}
	operator, valid := serviceBehaviorString(rule["operator"])
	if !valid {
		return false
	}
	value, hasValue := rule["value"]
	switch field {
	case "identity.isAuthenticated", "identity.isEmployee", "live.isOpen", "live.isConnected":
		return !hasValue && (operator == "is-true" || operator == "is-false")
	case "identity.groups":
		v, valid := serviceBehaviorString(value)
		return hasValue && valid && v != "" && (operator == "contains" || operator == "not-contains")
	case "live.queueLength":
		return hasValue && serviceBehaviorNumber(value) && (operator == "eq" || operator == "ne" || operator == "gt" || operator == "gte" || operator == "lt" || operator == "lte")
	case "session.selectedServiceId":
		v, valid := serviceBehaviorString(value)
		return hasValue && valid && v != "" && (operator == "eq" || operator == "ne")
	default:
		return false
	}
}

func validateServiceBehaviorConditionGroup(group map[string]json.RawMessage) bool {
	for key := range group {
		if key != "kind" && key != "combinator" && key != "children" {
			return false
		}
	}
	combinator, valid := serviceBehaviorString(group["combinator"])
	if !valid || (combinator != "and" && combinator != "or") {
		return false
	}
	children, valid := serviceBehaviorArray(group["children"])
	if !valid || len(children) == 0 {
		return false
	}
	for _, child := range children {
		if !validateServiceBehaviorCondition(child) {
			return false
		}
	}
	return true
}

func validateServiceBehaviorLocalizedText(raw json.RawMessage) bool {
	localized, ok := serviceBehaviorObject(raw, nil)
	if !ok || len(localized) == 0 {
		return false
	}
	for locale, rawText := range localized {
		text, valid := serviceBehaviorString(rawText)
		if locale == "" || !valid || text == "" {
			return false
		}
	}
	return true
}

func serviceBehaviorObject(raw json.RawMessage, allowed map[string]struct{}) (map[string]json.RawMessage, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, false
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil || object == nil {
		return nil, false
	}
	if allowed != nil {
		for key := range object {
			if _, known := allowed[key]; !known {
				return nil, false
			}
		}
	}
	return object, true
}

func serviceBehaviorArray(raw json.RawMessage) ([]json.RawMessage, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return nil, false
	}
	var values []json.RawMessage
	if err := json.Unmarshal(trimmed, &values); err != nil {
		return nil, false
	}
	return values, true
}

func serviceBehaviorString(raw json.RawMessage) (string, bool) {
	trimmed := bytes.TrimSpace(raw)
	var value string
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || json.Unmarshal(trimmed, &value) != nil {
		return "", false
	}
	return value, true
}

func serviceBehaviorBool(raw json.RawMessage) (bool, bool) {
	trimmed := bytes.TrimSpace(raw)
	var value bool
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || json.Unmarshal(trimmed, &value) != nil {
		return false, false
	}
	return value, true
}

func serviceBehaviorInt(raw json.RawMessage) (int, bool) {
	trimmed := bytes.TrimSpace(raw)
	var value int
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || json.Unmarshal(trimmed, &value) != nil {
		return 0, false
	}
	return value, true
}

func serviceBehaviorNumber(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	var value float64
	return len(trimmed) > 0 && !bytes.Equal(trimmed, []byte("null")) && json.Unmarshal(trimmed, &value) == nil
}
