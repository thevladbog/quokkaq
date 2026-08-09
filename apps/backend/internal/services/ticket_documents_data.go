package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
)

const (
	// maxTicketDocumentsDataBytes is a hard cap on the stored JSON for documentsData.
	maxTicketDocumentsDataBytes = 64 * 1024
)

// ErrDocumentsDataNotAllowed is returned when documentsData is set but the service identification mode disallows it.
var ErrDocumentsDataNotAllowed = errors.New("documentsData is not allowed for this service")

// ErrDocumentsDataInvalid is returned when documentsData is not a JSON object.
var ErrDocumentsDataInvalid = errors.New("documentsData must be a non-null JSON object")

// ErrServiceBehaviorFormInvalid is returned for a submitted form that does not
// conform to its service behavior. It wraps the public documentsData validation
// error so ticket handlers keep returning HTTP 400 without exposing form values.
var ErrServiceBehaviorFormInvalid = fmt.Errorf("%w: service behavior form invalid", ErrDocumentsDataInvalid)

// ErrDocumentsDataPayloadTooLarge is returned when documentsData exceeds the server size cap.
var ErrDocumentsDataPayloadTooLarge = errors.New("documentsData payload too large")

// ErrKioskConfigRetentionOutOfRange is returned when retentionDays is not in 1..30 when required.
var ErrKioskConfigRetentionOutOfRange = errors.New("kiosk config: retentionDays must be between 1 and 30")

// ErrKioskConfigRetentionRequiredWhenSensitive is returned when sensitive is true but no retention field is set.
var ErrKioskConfigRetentionRequiredWhenSensitive = errors.New("kiosk config: retention is required when sensitive is true")

// ErrDocumentsDataWithKioskIdp is returned when documentsData is set together with employee badge/login identification.
var ErrDocumentsDataWithKioskIdp = errors.New("documentsData is not combinable with kioskIdentifiedUserId for this service")

// HasRequestDocumentsData returns true when the client provided a non-empty JSON body for documentsData.
func HasRequestDocumentsData(m *json.RawMessage) bool {
	if m == nil {
		return false
	}
	t := bytes.TrimSpace(*m)
	return len(t) > 0 && string(t) != "null"
}

// ResolveDocumentsDataForNewTicket returns normalized JSON for storage, optional expiry, or nils when the body is empty.
func ResolveDocumentsDataForNewTicket(service *models.Service, in *json.RawMessage) (data json.RawMessage, exp *time.Time, err error) {
	if in == nil || len(*in) == 0 {
		return nil, nil, nil
	}
	trim := bytes.TrimSpace(*in)
	if len(trim) == 0 || string(trim) == "null" {
		return nil, nil, nil
	}
	if len(trim) > maxTicketDocumentsDataBytes {
		return nil, nil, fmt.Errorf("%w: max %d bytes", ErrDocumentsDataPayloadTooLarge, maxTicketDocumentsDataBytes)
	}
	requestData := json.RawMessage(trim)
	m, behaviorForm, validObject := classifyServiceBehaviorFormDocumentsData(service, &requestData)
	if !validObject {
		return nil, nil, ErrDocumentsDataInvalid
	}
	if behaviorForm {
		return resolveServiceBehaviorFormDocumentsData(service, m)
	}
	mode := service.IdentificationMode
	if mode != models.IdentificationModeDocument && mode != models.IdentificationModeCustom {
		return nil, nil, ErrDocumentsDataNotAllowed
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	switch mode {
	case models.IdentificationModeDocument:
		days, derr := parseRetentionFromKioskDocumentSettings(service.KioskDocumentSettings)
		if derr != nil {
			return nil, nil, derr
		}
		t := now.AddDate(0, 0, days)
		return out, &t, nil
	case models.IdentificationModeCustom:
		sens, rdays, serr := parseKioskIdentConfigSensitive(service.KioskIdentificationConfig)
		if serr != nil {
			return nil, nil, serr
		}
		if sens {
			if rdays < 1 || rdays > 30 {
				return nil, nil, ErrKioskConfigRetentionOutOfRange
			}
			t := now.AddDate(0, 0, rdays)
			return out, &t, nil
		}
		// non-sensitive: keep JSON; no auto-expiry (no cron) unless a future product rule adds optional TTL.
		return out, nil, nil
	}
	return nil, nil, ErrDocumentsDataNotAllowed
}

// IsServiceBehaviorFormDocumentsData reports whether a request is exclusively
// using the configured behavior form namespace. Ticket creation uses this to
// allow behavior fields with employee identity while preserving the legacy
// document/custom identity conflict rule.
func IsServiceBehaviorFormDocumentsData(service *models.Service, in *json.RawMessage) bool {
	_, behaviorForm, validObject := classifyServiceBehaviorFormDocumentsData(service, in)
	return validObject && behaviorForm
}

// classifyServiceBehaviorFormDocumentsData is the only behavior-form classifier.
// It checks the complete documentsData size before parsing and returns the parsed
// object so resolver and employee-identity paths share the exact same decision.
func classifyServiceBehaviorFormDocumentsData(service *models.Service, in *json.RawMessage) (map[string]json.RawMessage, bool, bool) {
	if in == nil || len(*in) == 0 {
		return nil, false, false
	}
	trimmed := bytes.TrimSpace(*in)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || len(trimmed) > maxTicketDocumentsDataBytes {
		return nil, false, false
	}
	var data map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &data); err != nil || data == nil {
		return nil, false, false
	}
	return data, isExactServiceBehaviorFormDocumentsData(service, data), true
}

func isExactServiceBehaviorFormDocumentsData(service *models.Service, data map[string]json.RawMessage) bool {
	if service == nil || models.CanonicalServiceBehavior(service.Behavior) == nil {
		return false
	}
	if len(data) != 1 {
		return false
	}
	form, hasForm := data["form"]
	if !hasForm {
		return false
	}
	_, validObject := serviceBehaviorObject(form, nil)
	return validObject
}

type serviceBehaviorFormField struct {
	key          string
	fieldType    string
	required     bool
	selectValues map[string]struct{}
}

func resolveServiceBehaviorFormDocumentsData(service *models.Service, data map[string]json.RawMessage) (json.RawMessage, *time.Time, error) {
	if len(data) != 1 {
		return nil, nil, ErrServiceBehaviorFormInvalid
	}
	form, ok := data["form"]
	if !ok {
		return nil, nil, ErrServiceBehaviorFormInvalid
	}
	values, valid := serviceBehaviorObject(form, nil)
	if !valid {
		return nil, nil, ErrServiceBehaviorFormInvalid
	}

	fields, retentionDays, err := parseServiceBehaviorFormDefinition(service.Behavior.RawJSON())
	if err != nil {
		return nil, nil, err
	}
	normalized := make(map[string]json.RawMessage, len(values))
	for key, value := range values {
		field, declared := fields[key]
		normalizedValue, valid := normalizeServiceBehaviorFormValue(value, field)
		if !declared || !valid {
			return nil, nil, ErrServiceBehaviorFormInvalid
		}
		normalized[key] = normalizedValue
	}
	for key, field := range fields {
		if field.required {
			if _, present := values[key]; !present {
				return nil, nil, ErrServiceBehaviorFormInvalid
			}
		}
	}

	normalizedForm, err := json.Marshal(normalized)
	if err != nil {
		return nil, nil, err
	}
	out, err := json.Marshal(map[string]json.RawMessage{"form": normalizedForm})
	if err != nil {
		return nil, nil, err
	}
	days, err := strictestDocumentsDataRetentionDays(service, retentionDays)
	if err != nil {
		return nil, nil, err
	}
	if days == nil {
		return out, nil, nil
	}
	expiresAt := time.Now().UTC().AddDate(0, 0, *days)
	return out, &expiresAt, nil
}

func parseServiceBehaviorFormDefinition(raw json.RawMessage) (map[string]serviceBehaviorFormField, *int, error) {
	if err := ValidateServiceBehaviorJSON(raw); err != nil {
		return nil, nil, err
	}
	behavior, ok := serviceBehaviorObject(raw, nil)
	if !ok {
		return nil, nil, ErrServiceBehaviorInvalid
	}
	fields := make(map[string]serviceBehaviorFormField)
	if rawFields, hasFields := behavior["fields"]; hasFields {
		items, valid := serviceBehaviorArray(rawFields)
		if !valid {
			return nil, nil, ErrServiceBehaviorInvalid
		}
		for _, item := range items {
			field, valid := serviceBehaviorObject(item, nil)
			if !valid {
				return nil, nil, ErrServiceBehaviorInvalid
			}
			key, _ := serviceBehaviorString(field["key"])
			fieldType, _ := serviceBehaviorString(field["type"])
			required, _ := serviceBehaviorBool(field["required"])
			definition := serviceBehaviorFormField{key: key, fieldType: fieldType, required: required}
			if fieldType == "select" {
				definition.selectValues = make(map[string]struct{})
				options, _ := serviceBehaviorArray(field["options"])
				for _, option := range options {
					optionObject, _ := serviceBehaviorObject(option, nil)
					optionKey, _ := serviceBehaviorString(optionObject["key"])
					definition.selectValues[optionKey] = struct{}{}
				}
			}
			fields[key] = definition
		}
	}

	var retentionDays *int
	if rawRetention, hasRetention := behavior["dataRetentionDays"]; hasRetention {
		value, valid := serviceBehaviorInt(rawRetention)
		if !valid {
			return nil, nil, ErrServiceBehaviorInvalid
		}
		retentionDays = &value
	}
	return fields, retentionDays, nil
}

func normalizeServiceBehaviorFormValue(raw json.RawMessage, field serviceBehaviorFormField) (json.RawMessage, bool) {
	switch field.fieldType {
	case "text":
		value, valid := serviceBehaviorString(raw)
		if !valid || (field.required && strings.TrimSpace(value) == "") {
			return nil, false
		}
		return append(json.RawMessage(nil), bytes.TrimSpace(raw)...), true
	case "phone":
		value, valid := serviceBehaviorString(raw)
		if !valid {
			return nil, false
		}
		if strings.TrimSpace(value) == "" {
			if field.required {
				return nil, false
			}
			return append(json.RawMessage(nil), bytes.TrimSpace(raw)...), true
		}
		normalized, err := phoneutil.ParseAndNormalize(value, phoneutil.DefaultRegion())
		if err != nil {
			return nil, false
		}
		out, err := json.Marshal(normalized)
		return out, err == nil
	case "number":
		if !serviceBehaviorNumber(raw) {
			return nil, false
		}
		return append(json.RawMessage(nil), bytes.TrimSpace(raw)...), true
	case "checkbox":
		value, valid := serviceBehaviorBool(raw)
		if !valid {
			return nil, false
		}
		out, err := json.Marshal(value)
		return out, err == nil
	case "select":
		value, valid := serviceBehaviorString(raw)
		if !valid {
			return nil, false
		}
		_, valid = field.selectValues[value]
		if !valid {
			return nil, false
		}
		return append(json.RawMessage(nil), bytes.TrimSpace(raw)...), true
	default:
		return nil, false
	}
}

func strictestDocumentsDataRetentionDays(service *models.Service, behaviorRetentionDays *int) (*int, error) {
	var strictest *int
	if behaviorRetentionDays != nil {
		value := *behaviorRetentionDays
		strictest = &value
	}

	switch service.IdentificationMode {
	case models.IdentificationModeDocument:
		days, err := parseRetentionFromKioskDocumentSettings(service.KioskDocumentSettings)
		if err != nil {
			return nil, err
		}
		strictest = minDocumentsDataRetentionDays(strictest, days)
	case models.IdentificationModeCustom:
		sensitive, days, err := parseKioskIdentConfigSensitive(service.KioskIdentificationConfig)
		if err != nil {
			return nil, err
		}
		if sensitive {
			if days < 1 || days > 30 {
				return nil, ErrKioskConfigRetentionOutOfRange
			}
			strictest = minDocumentsDataRetentionDays(strictest, days)
		}
	}
	return strictest, nil
}

func minDocumentsDataRetentionDays(current *int, candidate int) *int {
	if current == nil || candidate < *current {
		value := candidate
		return &value
	}
	return current
}

func parseRetentionFromKioskDocumentSettings(raw json.RawMessage) (int, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return 7, nil
	}
	var s struct {
		RetentionDays      *int `json:"retentionDays"`
		RetentionDaysSnake *int `json:"retention_days"`
	}
	if err := json.Unmarshal(trimmed, &s); err != nil {
		return 0, fmt.Errorf("kioskDocumentSettings: %w", err)
	}
	retention := s.RetentionDays
	if retention == nil {
		retention = s.RetentionDaysSnake
	}
	if retention == nil {
		return 7, nil
	}
	d := *retention
	if d < 1 || d > 30 {
		return 0, ErrKioskConfigRetentionOutOfRange
	}
	return d, nil
}

func parseKioskIdentConfigSensitive(raw json.RawMessage) (sensitive bool, retentionDays int, err error) {
	if len(raw) == 0 || string(raw) == "null" {
		return false, 0, nil
	}
	var cfg struct {
		Sensitive        *bool `json:"sensitive"`
		RetentionDays    *int  `json:"retentionDays"`
		RetentionDaysAlt *int  `json:"retention_days"` // tolerate snake_case
	}
	if e := json.Unmarshal(raw, &cfg); e != nil {
		return false, 0, fmt.Errorf("kioskIdentificationConfig: %w", e)
	}
	if cfg.Sensitive == nil {
		return false, 0, nil
	}
	if !*cfg.Sensitive {
		return false, 0, nil
	}
	if cfg.RetentionDays != nil {
		return true, *cfg.RetentionDays, nil
	}
	if cfg.RetentionDaysAlt != nil {
		return true, *cfg.RetentionDaysAlt, nil
	}
	return true, 0, ErrKioskConfigRetentionRequiredWhenSensitive
}
