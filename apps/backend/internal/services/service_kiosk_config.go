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
	var s struct {
		RetentionDays *int `json:"retentionDays"`
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return fmt.Errorf("kioskDocumentSettings: %w", err)
	}
	if s.RetentionDays == nil {
		return nil
	}
	if *s.RetentionDays < 1 || *s.RetentionDays > 30 {
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
		Sensitive     *bool            `json:"sensitive"`
		RetentionDays *int             `json:"retentionDays"`
		RetentionAlt  *int             `json:"retention_days"`
		APIFieldKey   *string          `json:"apiFieldKey"`
		ShowInQueue   *bool            `json:"showInQueuePreview"`
		Capture       *json.RawMessage `json:"capture"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("kioskIdentificationConfig: %w", err)
	}
	if cfg.Sensitive != nil && *cfg.Sensitive {
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
	_ = cfg.Capture
	_ = cfg.ShowInQueue
	return nil
}
