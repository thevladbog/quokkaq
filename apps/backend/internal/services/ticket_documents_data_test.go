package services

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func svcDoc(settings string) *models.Service {
	return &models.Service{
		IdentificationMode:    models.IdentificationModeDocument,
		KioskDocumentSettings: json.RawMessage(settings),
	}
}

func svcCustom(kiosk string) *models.Service {
	return &models.Service{
		IdentificationMode:        models.IdentificationModeCustom,
		KioskIdentificationConfig: json.RawMessage(kiosk),
	}
}

func svcBehavior(mode, behavior string) *models.Service {
	return &models.Service{
		IdentificationMode: mode,
		Behavior:           json.RawMessage(behavior),
	}
}

func TestHasRequestDocumentsData(t *testing.T) {
	empty := json.RawMessage(" {} ")
	if !HasRequestDocumentsData(&empty) {
		t.Fatal("expected true for object body")
	}
	space := json.RawMessage("  ")
	if HasRequestDocumentsData(&space) {
		t.Fatal("expected false for whitespace only")
	}
	if HasRequestDocumentsData(nil) {
		t.Fatal("expected false for nil")
	}
	nullish := json.RawMessage(" null ")
	if HasRequestDocumentsData(&nullish) {
		t.Fatal("expected false for null")
	}
}

func TestResolveDocumentsDataForNewTicket(t *testing.T) {
	t.Run("empty body", func(t *testing.T) {
		_, exp, err := ResolveDocumentsDataForNewTicket(svcDoc(`{"retentionDays":7}`), nil)
		if err != nil {
			t.Fatal(err)
		}
		if exp != nil {
			t.Fatalf("exp want nil, got %v", exp)
		}
	})

	t.Run("document mode with retention", func(t *testing.T) {
		in := json.RawMessage(`{"idDocumentOcr": "  MRZLINE  "}`)
		data, exp, err := ResolveDocumentsDataForNewTicket(svcDoc(`{"retentionDays":3}`), &in)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
		if data == nil {
			t.Fatal("expected data")
		}
		if !strings.Contains(string(data), "idDocumentOcr") {
			t.Fatalf("data: %s", data)
		}
	})

	t.Run("document default retention 7", func(t *testing.T) {
		in := json.RawMessage(`{"k":"v"}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(svcDoc(`null`), &in)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
		before := time.Now().UTC().AddDate(0, 0, 6)
		after := time.Now().UTC().AddDate(0, 0, 8)
		if exp.Before(before) || exp.After(after) {
			t.Fatalf("exp ~7d, got %v", exp)
		}
	})

	t.Run("document retention accepts snake_case", func(t *testing.T) {
		in := json.RawMessage(`{"idDocumentOcr":"X"}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(
			svcDoc(`{"retention_days":4}`),
			&in,
		)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
		before := time.Now().UTC().AddDate(0, 0, 3)
		after := time.Now().UTC().AddDate(0, 0, 5)
		if exp.Before(before) || exp.After(after) {
			t.Fatalf("exp ~4d, got %v", exp)
		}
	})

	t.Run("document invalid retention 0", func(t *testing.T) {
		in := json.RawMessage(`{"a":1}`)
		_, _, err := ResolveDocumentsDataForNewTicket(svcDoc(`{"retentionDays":0}`), &in)
		if err == nil {
			t.Fatal("expected error for retention 0")
		}
	})

	t.Run("phone mode rejects", func(t *testing.T) {
		s := &models.Service{IdentificationMode: models.IdentificationModePhone}
		in := json.RawMessage(`{"a":1}`)
		_, _, err := ResolveDocumentsDataForNewTicket(s, &in)
		if err == nil {
			t.Fatal("expected ErrDocumentsDataNotAllowed")
		}
		if !errors.Is(err, ErrDocumentsDataNotAllowed) {
			t.Fatalf("err %v", err)
		}
	})

	t.Run("not json object", func(t *testing.T) {
		in := json.RawMessage(`[1]`)
		_, _, err := ResolveDocumentsDataForNewTicket(svcDoc(`{}`), &in)
		if !errors.Is(err, ErrDocumentsDataInvalid) {
			t.Fatalf("err %v", err)
		}
	})

	t.Run("payload too large", func(t *testing.T) {
		inner := maxTicketDocumentsDataBytes
		// `{"a":"` + (inner - 6 for overhead)  ... actually build until bytes exceed cap
		const prefix = `{"a":"`
		pad := inner - len(prefix) - 2
		if pad < 0 {
			t.Fatal("config")
		}
		body := prefix + strings.Repeat("X", pad+100) + `"}`
		if len([]byte(body)) <= maxTicketDocumentsDataBytes {
			t.Fatalf("expected oversized body, got %d", len([]byte(body)))
		}
		in := json.RawMessage(body)
		_, _, err := ResolveDocumentsDataForNewTicket(svcDoc(`{}`), &in)
		if !errors.Is(err, ErrDocumentsDataPayloadTooLarge) {
			t.Fatalf("want ErrDocumentsDataPayloadTooLarge, got %v", err)
		}
	})

	t.Run("custom non-sensitive no expiry", func(t *testing.T) {
		in := json.RawMessage(`{"ref":"X"}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(
			svcCustom(`{"sensitive": false}`), &in)
		if err != nil {
			t.Fatal(err)
		}
		if exp != nil {
			t.Fatalf("exp want nil, got %v", exp)
		}
	})

	t.Run("custom sensitive with retention", func(t *testing.T) {
		in := json.RawMessage(`{"ref":"X"}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(
			svcCustom(`{"sensitive": true, "retentionDays": 14}`), &in)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
	})

	t.Run("custom sensitive missing retention", func(t *testing.T) {
		in := json.RawMessage(`{"a":1}`)
		_, _, err := ResolveDocumentsDataForNewTicket(
			svcCustom(`{"sensitive": true}`), &in)
		if !errors.Is(err, ErrKioskConfigRetentionRequiredWhenSensitive) {
			t.Fatalf("err %v", err)
		}
	})
}

func TestResolveDocumentsDataForNewTicketBehaviorForm(t *testing.T) {
	behavior := `{
  "version": 1,
  "fields": [
    {"key": "room", "label": {"en": "Room"}, "type": "text", "required": true},
    {"key": "floor", "label": {"en": "Floor"}, "type": "number", "required": false},
    {"key": "arrival", "label": {"en": "Arrival"}, "type": "checkbox", "required": true}
  ],
  "dataRetentionDays": 2
}`

	t.Run("accepts namespaced form with employee identity", func(t *testing.T) {
		service := svcBehavior(models.IdentificationModeBadge, behavior)
		in := json.RawMessage(`{"form":{"room":"A-101","floor":4,"arrival":true}}`)
		if !IsServiceBehaviorFormDocumentsData(service, &in) {
			t.Fatal("employee ticket path must allow a declared behavior form")
		}
		data, exp, err := ResolveDocumentsDataForNewTicket(service, &in)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), `"form"`) {
			t.Fatalf("data: %s", data)
		}
		if exp == nil {
			t.Fatal("expected behavior retention expiry")
		}
		legacy := json.RawMessage(`{"idDocumentOcr":"MRZ"}`)
		if IsServiceBehaviorFormDocumentsData(service, &legacy) {
			t.Fatal("employee ticket path must keep legacy identification payloads rejected")
		}
	})

	t.Run("uses behavior retention expiry", func(t *testing.T) {
		in := json.RawMessage(`{"form":{"room":"A-101","arrival":true}}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(
			svcBehavior(models.IdentificationModeNone, behavior),
			&in,
		)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
		before := time.Now().UTC().AddDate(0, 0, 1)
		after := time.Now().UTC().AddDate(0, 0, 3)
		if exp.Before(before) || exp.After(after) {
			t.Fatalf("exp ~2d, got %v", exp)
		}
	})

	t.Run("preserves stricter document retention", func(t *testing.T) {
		service := svcBehavior(models.IdentificationModeDocument, behavior)
		service.KioskDocumentSettings = json.RawMessage(`{"retentionDays":1}`)
		in := json.RawMessage(`{"form":{"room":"A-101","arrival":true}}`)
		_, exp, err := ResolveDocumentsDataForNewTicket(service, &in)
		if err != nil {
			t.Fatal(err)
		}
		if exp == nil {
			t.Fatal("expected expiry")
		}
		before := time.Now().UTC().AddDate(0, 0, 0)
		after := time.Now().UTC().AddDate(0, 0, 2)
		if exp.Before(before) || exp.After(after) {
			t.Fatalf("exp ~1d, got %v", exp)
		}
	})

	t.Run("rejects undeclared form key", func(t *testing.T) {
		in := json.RawMessage(`{"form":{"room":"A-101","arrival":true,"secret":"x"}}`)
		_, _, err := ResolveDocumentsDataForNewTicket(
			svcBehavior(models.IdentificationModeNone, behavior),
			&in,
		)
		if !errors.Is(err, ErrServiceBehaviorFormInvalid) {
			t.Fatalf("err = %v, want %v", err, ErrServiceBehaviorFormInvalid)
		}
	})

	t.Run("rejects wrong field value type", func(t *testing.T) {
		in := json.RawMessage(`{"form":{"room":101,"arrival":true}}`)
		_, _, err := ResolveDocumentsDataForNewTicket(
			svcBehavior(models.IdentificationModeNone, behavior),
			&in,
		)
		if !errors.Is(err, ErrServiceBehaviorFormInvalid) {
			t.Fatalf("err = %v, want %v", err, ErrServiceBehaviorFormInvalid)
		}
	})

	t.Run("keeps legacy flat document payloads compatible", func(t *testing.T) {
		in := json.RawMessage(`{"idDocumentOcr":"MRZ"}`)
		data, exp, err := ResolveDocumentsDataForNewTicket(svcDoc(`{"retentionDays":3}`), &in)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), "idDocumentOcr") || exp == nil {
			t.Fatalf("legacy data = %s, expiry = %v", data, exp)
		}
	})
}
