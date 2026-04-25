package services

import (
	"encoding/json"
	"errors"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestValidateServiceKioskFields(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		if err := ValidateServiceKioskFields(nil); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("invalid json kioskDocumentSettings", func(t *testing.T) {
		s := &models.Service{
			IdentificationMode:    models.IdentificationModeDocument,
			KioskDocumentSettings: json.RawMessage(`{not json`),
		}
		if err := ValidateServiceKioskFields(s); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("document retention 0", func(t *testing.T) {
		d := 0
		b, _ := json.Marshal(struct {
			RetentionDays *int `json:"retentionDays"`
		}{RetentionDays: &d})
		s := &models.Service{
			IdentificationMode:    models.IdentificationModeDocument,
			KioskDocumentSettings: b,
		}
		if err := ValidateServiceKioskFields(s); !errors.Is(err, ErrKioskConfigRetentionOutOfRange) {
			t.Fatalf("err: %v", err)
		}
	})

	t.Run("document retention 31", func(t *testing.T) {
		d := 31
		b, _ := json.Marshal(struct {
			RetentionDays *int `json:"retentionDays"`
		}{RetentionDays: &d})
		s := &models.Service{
			IdentificationMode:    models.IdentificationModeDocument,
			KioskDocumentSettings: b,
		}
		if err := ValidateServiceKioskFields(s); !errors.Is(err, ErrKioskConfigRetentionOutOfRange) {
			t.Fatalf("err: %v", err)
		}
	})

	t.Run("custom sensitive without retention", func(t *testing.T) {
		sn := true
		b, _ := json.Marshal(struct {
			Sensitive *bool `json:"sensitive"`
		}{Sensitive: &sn})
		s := &models.Service{
			IdentificationMode:        models.IdentificationModeCustom,
			KioskIdentificationConfig: b,
		}
		if err := ValidateServiceKioskFields(s); !errors.Is(err, ErrKioskConfigRetentionOutOfRange) {
			t.Fatalf("err: %v", err)
		}
	})

	t.Run("custom empty apiFieldKey", func(t *testing.T) {
		k := "   "
		b, _ := json.Marshal(struct {
			APIFieldKey *string `json:"apiFieldKey"`
		}{APIFieldKey: &k})
		s := &models.Service{
			IdentificationMode:        models.IdentificationModeCustom,
			KioskIdentificationConfig: b,
		}
		if err := ValidateServiceKioskFields(s); err == nil {
			t.Fatal("expected error for empty apiFieldKey when set")
		}
	})

	t.Run("custom valid", func(t *testing.T) {
		sn := true
		rd := 5
		k := "fieldKey"
		b, _ := json.Marshal(struct {
			Sensitive     *bool   `json:"sensitive"`
			RetentionDays *int    `json:"retentionDays"`
			APIFieldKey   *string `json:"apiFieldKey"`
		}{Sensitive: &sn, RetentionDays: &rd, APIFieldKey: &k})
		serv := &models.Service{
			IdentificationMode:        models.IdentificationModeCustom,
			KioskIdentificationConfig: b,
		}
		if err := ValidateServiceKioskFields(serv); err != nil {
			t.Fatal(err)
		}
	})
}
