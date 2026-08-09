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
	parsed, err := models.ParseServiceBehaviorJSON(json.RawMessage(behavior))
	if err != nil {
		panic(err)
	}
	return &models.Service{
		IdentificationMode: mode,
		Behavior:           parsed,
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
    {"key": "required_text", "label": {"en": "Required text"}, "type": "text", "required": true},
    {"key": "optional_text", "label": {"en": "Optional text"}, "type": "text", "required": false},
    {"key": "required_phone", "label": {"en": "Required phone"}, "type": "phone", "required": true},
    {"key": "optional_phone", "label": {"en": "Optional phone"}, "type": "phone", "required": false},
    {"key": "required_number", "label": {"en": "Required number"}, "type": "number", "required": true},
    {"key": "optional_number", "label": {"en": "Optional number"}, "type": "number", "required": false},
    {"key": "reason", "label": {"en": "Reason"}, "type": "select", "required": true, "options": [{"key":"consultation","label":{"en":"Consultation"}},{"key":"pickup","label":{"en":"Pickup"}}]},
    {"key": "optional_reason", "label": {"en": "Optional reason"}, "type": "select", "required": false, "options": [{"key":"consultation","label":{"en":"Consultation"}}]},
    {"key": "arrival", "label": {"en": "Arrival"}, "type": "checkbox", "required": true},
    {"key": "optional_checkbox", "label": {"en": "Optional checkbox"}, "type": "checkbox", "required": false}
  ],
  "dataRetentionDays": 2
}`
	form := func(omit string, values map[string]any) json.RawMessage {
		t.Helper()
		base := map[string]any{
			"required_text":   "A-101",
			"required_phone":  "+79001234567",
			"required_number": 4,
			"reason":          "consultation",
			"arrival":         false,
		}
		delete(base, omit)
		for key, value := range values {
			base[key] = value
		}
		out, err := json.Marshal(map[string]any{"form": base})
		if err != nil {
			t.Fatal(err)
		}
		return out
	}

	t.Run("accepts namespaced form with employee identity", func(t *testing.T) {
		service := svcBehavior(models.IdentificationModeBadge, behavior)
		in := form("", nil)
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
		in := form("", nil)
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
		in := form("", nil)
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

	t.Run("preserves stricter sensitive custom retention", func(t *testing.T) {
		service := svcBehavior(models.IdentificationModeCustom, behavior)
		service.KioskIdentificationConfig = json.RawMessage(`{"sensitive":true,"retentionDays":1}`)
		in := form("", nil)
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
		in := form("", map[string]any{"secret": "x"})
		_, _, err := ResolveDocumentsDataForNewTicket(
			svcBehavior(models.IdentificationModeNone, behavior),
			&in,
		)
		if !errors.Is(err, ErrServiceBehaviorFormInvalid) {
			t.Fatalf("err = %v, want %v", err, ErrServiceBehaviorFormInvalid)
		}
	})

	for _, tt := range []struct {
		name  string
		omit  string
		value map[string]any
		valid bool
	}{
		{name: "required text omitted", omit: "required_text"},
		{name: "required text null", value: map[string]any{"required_text": nil}},
		{name: "required text whitespace", value: map[string]any{"required_text": "  "}},
		{name: "required text valid", valid: true},
		{name: "optional text omitted", omit: "optional_text", valid: true},
		{name: "optional text null", value: map[string]any{"optional_text": nil}},
		{name: "optional text empty", value: map[string]any{"optional_text": ""}, valid: true},
		{name: "optional text wrong type", value: map[string]any{"optional_text": 1}},
		{name: "required phone omitted", omit: "required_phone"},
		{name: "required phone null", value: map[string]any{"required_phone": nil}},
		{name: "required phone empty", value: map[string]any{"required_phone": ""}},
		{name: "required phone invalid", value: map[string]any{"required_phone": "not-a-phone"}},
		{name: "required phone valid", valid: true},
		{name: "optional phone omitted", omit: "optional_phone", valid: true},
		{name: "optional phone null", value: map[string]any{"optional_phone": nil}},
		{name: "optional phone empty", value: map[string]any{"optional_phone": ""}, valid: true},
		{name: "optional phone invalid", value: map[string]any{"optional_phone": "not-a-phone"}},
		{name: "optional phone valid", value: map[string]any{"optional_phone": "8 900 123 45 67"}, valid: true},
		{name: "required number omitted", omit: "required_number"},
		{name: "required number null", value: map[string]any{"required_number": nil}},
		{name: "required number empty", value: map[string]any{"required_number": ""}},
		{name: "required number valid", value: map[string]any{"required_number": 1.0}, valid: true},
		{name: "optional number omitted", omit: "optional_number", valid: true},
		{name: "optional number null", value: map[string]any{"optional_number": nil}},
		{name: "optional number wrong type", value: map[string]any{"optional_number": "1"}},
		{name: "optional number valid", value: map[string]any{"optional_number": 1.5}, valid: true},
		{name: "required select omitted", omit: "reason"},
		{name: "required select null", value: map[string]any{"reason": nil}},
		{name: "required select empty", value: map[string]any{"reason": ""}},
		{name: "required select localized label", value: map[string]any{"reason": "Consultation"}},
		{name: "required select stable key", value: map[string]any{"reason": "pickup"}, valid: true},
		{name: "optional select omitted", omit: "optional_reason", valid: true},
		{name: "optional select null", value: map[string]any{"optional_reason": nil}},
		{name: "optional select invalid", value: map[string]any{"optional_reason": "pickup"}},
		{name: "optional select stable key", value: map[string]any{"optional_reason": "consultation"}, valid: true},
		{name: "required checkbox omitted", omit: "arrival"},
		{name: "required checkbox null", value: map[string]any{"arrival": nil}},
		{name: "required checkbox wrong type", value: map[string]any{"arrival": "false"}},
		{name: "required checkbox false", value: map[string]any{"arrival": false}, valid: true},
		{name: "optional checkbox omitted", omit: "optional_checkbox", valid: true},
		{name: "optional checkbox null", value: map[string]any{"optional_checkbox": nil}},
		{name: "optional checkbox wrong type", value: map[string]any{"optional_checkbox": "false"}},
		{name: "optional checkbox false", value: map[string]any{"optional_checkbox": false}, valid: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := form(tt.omit, tt.value)
			_, _, err := ResolveDocumentsDataForNewTicket(svcBehavior(models.IdentificationModeNone, behavior), &in)
			if tt.valid && err != nil {
				t.Fatalf("valid behavior form rejected: %v", err)
			}
			if !tt.valid && !errors.Is(err, ErrServiceBehaviorFormInvalid) {
				t.Fatalf("invalid behavior form error = %v", err)
			}
		})
	}

	t.Run("normalizes phone values before persistence", func(t *testing.T) {
		in := form("", map[string]any{"optional_phone": "8 900 123 45 67"})
		data, _, err := ResolveDocumentsDataForNewTicket(svcBehavior(models.IdentificationModeNone, behavior), &in)
		if err != nil {
			t.Fatal(err)
		}
		var stored struct {
			Form map[string]any `json:"form"`
		}
		if err := json.Unmarshal(data, &stored); err != nil {
			t.Fatal(err)
		}
		if stored.Form["optional_phone"] != "+79001234567" {
			t.Fatalf("stored normalized phone = %v", stored.Form["optional_phone"])
		}
	})

	t.Run("recognizes only an exact non-null object form namespace", func(t *testing.T) {
		service := svcBehavior(models.IdentificationModeBadge, behavior)
		for _, tt := range []struct {
			name string
			body string
			want bool
		}{
			{name: "exact object", body: `{"form":{"required_text":"A-101","required_phone":"+79001234567","required_number":4,"reason":"consultation","arrival":false}}`, want: true},
			{name: "scalar form", body: `{"form":"legacy"}`},
			{name: "null form", body: `{"form":null}`},
			{name: "multi root form", body: `{"form":{},"idDocumentOcr":"legacy"}`},
		} {
			t.Run(tt.name, func(t *testing.T) {
				in := json.RawMessage(tt.body)
				if got := IsServiceBehaviorFormDocumentsData(service, &in); got != tt.want {
					t.Fatalf("classifier = %v, want %v", got, tt.want)
				}
			})
		}
	})

	t.Run("keeps legacy document and custom payloads containing form compatible", func(t *testing.T) {
		for _, service := range []*models.Service{
			svcDoc(`{"retentionDays":3}`),
			svcCustom(`{"sensitive":false}`),
		} {
			in := json.RawMessage(`{"form":"legacy"}`)
			data, _, err := ResolveDocumentsDataForNewTicket(service, &in)
			if err != nil || !strings.Contains(string(data), `"form":"legacy"`) {
				t.Fatalf("legacy form payload error = %v", err)
			}
		}
	})

	t.Run("keeps the 64 KiB documentsData boundary for exact behavior forms", func(t *testing.T) {
		minimalBehavior := `{"version":1,"fields":[{"key":"note","label":{"en":"Note"},"type":"text","required":true}],"dataRetentionDays":1}`
		const prefix = `{"form":{"note":"`
		const suffix = `"}}`
		atLimit := json.RawMessage(prefix + strings.Repeat("x", maxTicketDocumentsDataBytes-len(prefix)-len(suffix)) + suffix)
		if len(atLimit) != maxTicketDocumentsDataBytes {
			t.Fatalf("at-limit form length = %d", len(atLimit))
		}
		if _, _, err := ResolveDocumentsDataForNewTicket(svcBehavior(models.IdentificationModeNone, minimalBehavior), &atLimit); err != nil {
			t.Fatalf("at-limit form rejected: %v", err)
		}
		aboveLimit := append(append(json.RawMessage(nil), atLimit...), 'x')
		if _, _, err := ResolveDocumentsDataForNewTicket(svcBehavior(models.IdentificationModeNone, minimalBehavior), &aboveLimit); !errors.Is(err, ErrDocumentsDataPayloadTooLarge) {
			t.Fatalf("above-limit form error = %v", err)
		}
	})
}
