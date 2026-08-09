package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"quokkaq-go-backend/internal/models"
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
	var m map[string]json.RawMessage
	if err := json.Unmarshal(trim, &m); err != nil || m == nil {
		return nil, nil, ErrDocumentsDataInvalid
	}
	if isServiceBehaviorFormDocumentsData(service, m) {
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
	if in == nil || len(*in) == 0 {
		return false
	}
	trimmed := bytes.TrimSpace(*in)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return false
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil || object == nil {
		return false
	}
	return isServiceBehaviorFormDocumentsData(service, object)
}

func isServiceBehaviorFormDocumentsData(service *models.Service, data map[string]json.RawMessage) bool {
	if service == nil || len(bytes.TrimSpace(service.Behavior)) == 0 || bytes.Equal(bytes.TrimSpace(service.Behavior), []byte("null")) {
		return false
	}
	_, hasForm := data["form"]
	return hasForm
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

	fields, retentionDays, err := parseServiceBehaviorFormDefinition(service.Behavior)
	if err != nil {
		return nil, nil, err
	}
	for key, value := range values {
		field, declared := fields[key]
		if !declared || !validateServiceBehaviorFormValue(value, field) {
			return nil, nil, ErrServiceBehaviorFormInvalid
		}
	}
	for key, field := range fields {
		if field.required {
			if _, present := values[key]; !present {
				return nil, nil, ErrServiceBehaviorFormInvalid
			}
		}
	}

	out, err := json.Marshal(data)
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
					localized, _ := serviceBehaviorObject(option, nil)
					for _, rawText := range localized {
						text, _ := serviceBehaviorString(rawText)
						definition.selectValues[text] = struct{}{}
					}
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

func validateServiceBehaviorFormValue(raw json.RawMessage, field serviceBehaviorFormField) bool {
	switch field.fieldType {
	case "text", "phone":
		_, valid := serviceBehaviorString(raw)
		return valid
	case "number":
		return serviceBehaviorNumber(raw)
	case "checkbox":
		_, valid := serviceBehaviorBool(raw)
		return valid
	case "select":
		value, valid := serviceBehaviorString(raw)
		if !valid {
			return false
		}
		_, valid = field.selectValues[value]
		return valid
	default:
		return false
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
