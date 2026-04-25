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
		if !errors.Is(err, ErrKioskConfigRetentionOutOfRange) {
			t.Fatalf("err %v", err)
		}
	})
}
