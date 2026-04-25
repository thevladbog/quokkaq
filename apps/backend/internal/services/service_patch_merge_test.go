package services

import (
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestMergeServiceJSONPatch_sparseGridKeepsNameAndPrefix(t *testing.T) {
	prefix := "A"
	existing := models.Service{
		ID:     "svc-1",
		UnitID: "unit-1",
		Name:   "Consultation",
		Prefix: &prefix,
	}
	merged := existing
	raw := map[string]json.RawMessage{
		"gridRow":     json.RawMessage(`2`),
		"gridCol":     json.RawMessage(`3`),
		"gridRowSpan": json.RawMessage(`1`),
		"gridColSpan": json.RawMessage(`2`),
	}
	if err := MergeServiceJSONPatch(&merged, raw); err != nil {
		t.Fatal(err)
	}
	if merged.Name != "Consultation" {
		t.Fatalf("name: got %q", merged.Name)
	}
	if merged.Prefix == nil || *merged.Prefix != "A" {
		t.Fatalf("prefix: got %#v", merged.Prefix)
	}
	if merged.GridRow == nil || *merged.GridRow != 2 {
		t.Fatalf("gridRow: got %#v", merged.GridRow)
	}
	if merged.GridCol == nil || *merged.GridCol != 3 {
		t.Fatalf("gridCol: got %#v", merged.GridCol)
	}
}

func TestMergeServiceJSONPatch_updatesNameWhenSent(t *testing.T) {
	existing := models.Service{ID: "x", UnitID: "u", Name: "Old"}
	merged := existing
	raw := map[string]json.RawMessage{"name": json.RawMessage(`"New"`)}
	if err := MergeServiceJSONPatch(&merged, raw); err != nil {
		t.Fatal(err)
	}
	if merged.Name != "New" {
		t.Fatalf("name: got %q", merged.Name)
	}
}

func TestMergeServiceJSONPatch_iconKey(t *testing.T) {
	existing := models.Service{ID: "x", UnitID: "u", Name: "N"}
	merged := existing
	raw := map[string]json.RawMessage{"iconKey": json.RawMessage(`"health"`)}
	if err := MergeServiceJSONPatch(&merged, raw); err != nil {
		t.Fatal(err)
	}
	if merged.IconKey == nil || *merged.IconKey != "health" {
		t.Fatalf("iconKey: got %#v", merged.IconKey)
	}
}
