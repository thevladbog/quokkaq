package services

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestValidateIdleScreen_emptyOK(t *testing.T) {
	if err := validateIdleScreen(nil, "unit-1"); err != nil {
		t.Fatalf("nil raw: %v", err)
	}
	if err := validateIdleScreen(json.RawMessage{}, "unit-1"); err != nil {
		t.Fatalf("empty raw: %v", err)
	}
}

func TestValidateIdleScreen_invalidJSON(t *testing.T) {
	err := validateIdleScreen(json.RawMessage(`{`), "unit-1")
	if err == nil {
		t.Fatal("expected error")
	}
	if err != ErrSurveyBadRequest {
		t.Fatalf("got %v want ErrSurveyBadRequest", err)
	}
}

func TestValidateIdleScreen_emptySlides(t *testing.T) {
	raw := json.RawMessage(`{"slideIntervalSec":0,"slides":[]}`)
	if err := validateIdleScreen(raw, "unit-1"); err != nil {
		t.Fatal(err)
	}
	badInterval := json.RawMessage(`{"slideIntervalSec":400,"slides":[]}`)
	if err := validateIdleScreen(badInterval, "unit-1"); err == nil {
		t.Fatal("expected bad request for interval with empty slides")
	}
}

func TestValidateIdleScreen_textSlide(t *testing.T) {
	raw := json.RawMessage(`{"slideIntervalSec":8,"slides":[{"type":"text","markdown":{"en":"Hello"}}]}`)
	if err := validateIdleScreen(raw, "unit-1"); err != nil {
		t.Fatal(err)
	}
}

func TestValidateIdleScreen_imageURLMustMatchScopeUnit(t *testing.T) {
	unit := "scope-abc"
	file := "550e8400-e29b-41d4-a716-446655440000.png"
	goodURL := fmt.Sprintf("/api/units/%s/guest-survey/idle-media/%s", unit, file)
	badURL := fmt.Sprintf("/api/units/other/guest-survey/idle-media/%s", file)

	good := json.RawMessage(fmt.Sprintf(`{"slideIntervalSec":5,"slides":[{"type":"image","url":%q}]}`, goodURL))
	if err := validateIdleScreen(good, unit); err != nil {
		t.Fatal(err)
	}

	bad := json.RawMessage(fmt.Sprintf(`{"slideIntervalSec":5,"slides":[{"type":"image","url":%q}]}`, badURL))
	if err := validateIdleScreen(bad, unit); err == nil {
		t.Fatal("expected error for wrong unit in URL")
	}
}

func TestValidateIdleScreen_unknownSlideType(t *testing.T) {
	raw := json.RawMessage(`{"slideIntervalSec":5,"slides":[{"type":"quiz","foo":1}]}`)
	if err := validateIdleScreen(raw, "unit-1"); err == nil {
		t.Fatal("expected error")
	}
}
