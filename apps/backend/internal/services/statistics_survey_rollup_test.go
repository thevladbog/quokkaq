package services

import (
	"encoding/json"
	"testing"
)

func TestParseSurveyQuestions_LegacyArray(t *testing.T) {
	raw := json.RawMessage(`[{"id":"q1","type":"scale","min":1,"max":5,"label":{}}]`)
	got := parseSurveyQuestions(raw)
	if len(got) != 1 || got[0].ID != "q1" || got[0].Min != 1 || got[0].Max != 5 {
		t.Fatalf("got %+v", got)
	}
}

func TestParseSurveyQuestions_WrappedBlocks(t *testing.T) {
	raw := json.RawMessage(`{"displayMode":"stepped","blocks":[{"id":"a","type":"scale","min":1,"max":5,"label":{}},{"id":"i","type":"info","label":{}}]}`)
	got := parseSurveyQuestions(raw)
	if len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("expected one scale block, got %+v", got)
	}
}

func TestParseSurveyQuestions_IconsScaleUses1To5(t *testing.T) {
	raw := json.RawMessage(`[{"id":"s","type":"scale","presentation":"icons","iconPreset":"stars_gold","label":{}}]`)
	got := parseSurveyQuestions(raw)
	if len(got) != 1 || got[0].Min != 1 || got[0].Max != 5 {
		t.Fatalf("got %+v", got)
	}
}
