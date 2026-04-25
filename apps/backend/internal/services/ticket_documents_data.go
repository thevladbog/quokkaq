package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

// ErrDocumentsDataPayloadTooLarge is returned when documentsData exceeds the server size cap.
var ErrDocumentsDataPayloadTooLarge = errors.New("documentsData payload too large")

// ErrKioskConfigRetentionOutOfRange is returned when retentionDays is not in 1..30 when required.
var ErrKioskConfigRetentionOutOfRange = errors.New("kiosk config: retentionDays must be between 1 and 30")

// ErrDocumentsDataWithKioskIdp is returned when documentsData is set together with employee badge/login identification.
var ErrDocumentsDataWithKioskIdp = errors.New("documentsData is not combinable with kioskIdentifiedUserId for this service")

// HasRequestDocumentsData returns true when the client provided a non-empty JSON body for documentsData.
func HasRequestDocumentsData(m *json.RawMessage) bool {
	if m == nil {
		return false
	}
	t := bytesTrimJSONBytes(*m)
	return len(t) > 0 && string(t) != "null"
}

// ResolveDocumentsDataForNewTicket returns normalized JSON for storage, optional expiry, or nils when the body is empty.
func ResolveDocumentsDataForNewTicket(service *models.Service, in *json.RawMessage) (data json.RawMessage, exp *time.Time, err error) {
	if in == nil || len(*in) == 0 {
		return nil, nil, nil
	}
	trim := bytesOrSpaceJSON(*in)
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

func bytesOrSpaceJSON(b []byte) []byte   { return bytesTrimJSONBytes(b) }
func bytesTrimJSONBytes(b []byte) []byte { return []byte(strings.TrimSpace(string(b))) }

func parseRetentionFromKioskDocumentSettings(raw json.RawMessage) (int, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return 7, nil
	}
	var s struct {
		RetentionDays *int `json:"retentionDays"`
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return 0, fmt.Errorf("kioskDocumentSettings: %w", err)
	}
	if s.RetentionDays == nil {
		return 7, nil
	}
	d := *s.RetentionDays
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
	return true, 0, ErrKioskConfigRetentionOutOfRange
}
