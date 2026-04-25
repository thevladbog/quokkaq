package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// ValidateServiceKioskFields enforces JSON shape for kiosk document / custom identification service fields.
func ValidateServiceKioskFields(s *models.Service) error {
	if s == nil {
		return nil
	}
	if len(s.KioskDocumentSettings) > 0 && !json.Valid(s.KioskDocumentSettings) {
		return fmt.Errorf("kioskDocumentSettings: invalid json")
	}
	if len(s.KioskIdentificationConfig) > 0 && !json.Valid(s.KioskIdentificationConfig) {
		return fmt.Errorf("kioskIdentificationConfig: invalid json")
	}
	switch s.IdentificationMode {
	case models.IdentificationModeDocument:
		if err := validateKioskDocumentSettingsJSON(s.KioskDocumentSettings); err != nil {
			return err
		}
	case models.IdentificationModeCustom:
		if err := validateKioskIdentificationConfigJSON(s.KioskIdentificationConfig); err != nil {
			return err
		}
	}
	return nil
}

func validateKioskDocumentSettingsJSON(raw json.RawMessage) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	// Intentionally ignoring other kiosk document fields here; only retention is validated.
	var s struct {
		RetentionDays *int `json:"retentionDays"`
		RetentionAlt  *int `json:"retention_days"`
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return fmt.Errorf("kioskDocumentSettings: %w", err)
	}
	d := 0
	if s.RetentionDays != nil {
		d = *s.RetentionDays
	} else if s.RetentionAlt != nil {
		d = *s.RetentionAlt
	} else {
		return nil
	}
	if d < 1 || d > 30 {
		return ErrKioskConfigRetentionOutOfRange
	}
	return nil
}

// validateKioskIdentificationConfigJSON is a minimal structural check; optional fields for capture kind etc. are client-defined.
func validateKioskIdentificationConfigJSON(raw json.RawMessage) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var cfg struct {
		Sensitive       *bool            `json:"sensitive"`
		RetentionDays   *int             `json:"retentionDays"`
		RetentionAlt    *int             `json:"retention_days"`
		APIFieldKey     *string          `json:"apiFieldKey"`
		ShowInQueue     *bool            `json:"showInQueuePreview"`
		Capture         *json.RawMessage `json:"capture"`
		Skippable       *bool            `json:"skippable"`
		UserInstruction *json.RawMessage `json:"userInstruction"`
		OperatorLabel   *json.RawMessage `json:"operatorLabel"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("kioskIdentificationConfig: %w", err)
	}
	// Intentionally ignoring optional capture/showInQueue/skippable/operator fields (validated client-side or unused server-side).
	if cfg.Sensitive != nil && *cfg.Sensitive {
		if cfg.RetentionDays == nil && cfg.RetentionAlt == nil {
			return ErrKioskConfigRetentionRequiredWhenSensitive
		}
		d := 0
		if cfg.RetentionDays != nil {
			d = *cfg.RetentionDays
		} else if cfg.RetentionAlt != nil {
			d = *cfg.RetentionAlt
		}
		if d < 1 || d > 30 {
			return ErrKioskConfigRetentionOutOfRange
		}
	}
	if cfg.APIFieldKey != nil {
		k := strings.TrimSpace(*cfg.APIFieldKey)
		if k == "" {
			return fmt.Errorf("kioskIdentificationConfig: apiFieldKey may not be empty when set")
		}
	}
	return nil
}
