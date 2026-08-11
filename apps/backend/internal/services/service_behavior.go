package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	maxServiceBehaviorJSONBytes      = 64 * 1024
	maxServiceBehaviorFields         = 50
	maxServiceBehaviorLocalizedItems = 8
	maxServiceBehaviorSelectOptions  = 50
	maxServiceBehaviorConditionDepth = 8
	maxServiceBehaviorConditionNodes = 100
	maxServiceBehaviorGroupChildren  = 20
)

// ErrServiceBehaviorInvalid is returned when a service behavior does not match
// the portable Phase 1 contract. It intentionally carries no submitted data.
var ErrServiceBehaviorInvalid = errors.New("service behavior is invalid")

var (
	serviceBehaviorFieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	serviceBehaviorNumberPattern   = regexp.MustCompile(`^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$`)
)

// ValidateServiceBehaviorJSON verifies the portable Service behavior contract.
// Empty and JSON-null values represent the optional legacy-compatible absence of behavior.
func ValidateServiceBehaviorJSON(raw json.RawMessage) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	if len(trimmed) > maxServiceBehaviorJSONBytes {
		return ErrServiceBehaviorInvalid
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
		if !fieldsOK || len(fields) > maxServiceBehaviorFields {
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
	if !ok || !validateServiceBehaviorLocalizedText(body, 4000) {
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
	if !hasLabel || !validateServiceBehaviorLocalizedText(label, 160) {
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
		if !valid || len(options) < 1 || len(options) > maxServiceBehaviorSelectOptions {
			return "", false
		}
		seen := make(map[string]struct{}, len(options))
		for _, option := range options {
			optionKey, valid := validateServiceBehaviorSelectOption(option)
			if !valid {
				return "", false
			}
			if _, duplicate := seen[optionKey]; duplicate {
				return "", false
			}
			seen[optionKey] = struct{}{}
		}
		return key, true
	default:
		return "", false
	}
}

func validateServiceBehaviorSelectOption(raw json.RawMessage) (string, bool) {
	option, ok := serviceBehaviorObject(raw, map[string]struct{}{
		"key":   {},
		"label": {},
	})
	if !ok {
		return "", false
	}
	key, valid := serviceBehaviorString(option["key"])
	if !valid || !serviceBehaviorFieldKeyPattern.MatchString(key) {
		return "", false
	}
	label, hasLabel := option["label"]
	return key, hasLabel && validateServiceBehaviorLocalizedText(label, 160)
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
	budget := &serviceBehaviorConditionBudget{}
	return validateServiceBehaviorCondition(when, 1, budget)
}

type serviceBehaviorConditionBudget struct {
	nodes int
}

func validateServiceBehaviorCondition(raw json.RawMessage, depth int, budget *serviceBehaviorConditionBudget) bool {
	if depth > maxServiceBehaviorConditionDepth {
		return false
	}
	budget.nodes++
	if budget.nodes > maxServiceBehaviorConditionNodes {
		return false
	}
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
		return validateServiceBehaviorConditionGroup(condition, depth, budget)
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

func validateServiceBehaviorConditionGroup(group map[string]json.RawMessage, depth int, budget *serviceBehaviorConditionBudget) bool {
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
	if !valid || len(children) == 0 || len(children) > maxServiceBehaviorGroupChildren {
		return false
	}
	for _, child := range children {
		if !validateServiceBehaviorCondition(child, depth+1, budget) {
			return false
		}
	}
	return true
}

func validateServiceBehaviorLocalizedText(raw json.RawMessage, maxValueLength int) bool {
	localized, ok := serviceBehaviorObject(raw, nil)
	if !ok || len(localized) == 0 || len(localized) > maxServiceBehaviorLocalizedItems {
		return false
	}
	for locale, rawText := range localized {
		text, valid := serviceBehaviorString(rawText)
		textLength := utf8.RuneCountInString(text)
		if len(locale) < 1 || len(locale) > 16 || !valid || textLength < 1 || textLength > maxValueLength {
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
	number, ok := serviceBehaviorJSONNumber(raw)
	if !ok {
		return 0, false
	}
	matches := serviceBehaviorNumberPattern.FindStringSubmatch(number)
	if matches == nil {
		return 0, false
	}

	exponent := 0
	if matches[4] != "" {
		parsedExponent, err := strconv.Atoi(matches[4])
		if err != nil || parsedExponent < -128 || parsedExponent > 128 {
			return 0, false
		}
		exponent = parsedExponent
	}
	digits := strings.TrimLeft(matches[2]+matches[3], "0")
	if digits == "" {
		return 0, true
	}
	scale := len(matches[3]) - exponent
	if scale > 0 {
		if scale > len(digits) || strings.TrimRight(digits, "0") != digits[:len(digits)-scale] {
			return 0, false
		}
		digits = digits[:len(digits)-scale]
	} else if scale < 0 {
		digits += strings.Repeat("0", -scale)
	}
	value, err := strconv.ParseInt(digits, 10, 64)
	if err != nil {
		return 0, false
	}
	if matches[1] == "-" {
		if value == math.MinInt64 {
			return 0, false
		}
		value = -value
	}
	if strconv.IntSize == 32 && (value < math.MinInt32 || value > math.MaxInt32) {
		return 0, false
	}
	return int(value), true
}

func serviceBehaviorNumber(raw json.RawMessage) bool {
	number, ok := serviceBehaviorJSONNumber(raw)
	if !ok {
		return false
	}
	value, err := strconv.ParseFloat(number, 64)
	return err == nil && !math.IsInf(value, 0) && !math.IsNaN(value)
}

func serviceBehaviorJSONNumber(raw json.RawMessage) (string, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return "", false
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return "", false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return "", false
	}
	number, ok := value.(json.Number)
	return number.String(), ok
}
