package services

import (
	"encoding/json"
	"testing"
)

func TestMergeDefaultKioskServiceGridLayoutAuto_emptyConfig(t *testing.T) {
	out := mergeDefaultKioskServiceGridLayoutAuto(nil)
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	k, ok := m["kiosk"].(map[string]any)
	if !ok {
		t.Fatalf("expected kiosk object, got %T", m["kiosk"])
	}
	if k["serviceGridLayout"] != "manual" {
		t.Fatalf("serviceGridLayout = %q, want manual", k["serviceGridLayout"])
	}
}

func TestMergeDefaultKioskServiceGridLayoutAuto_preservesExplicitAuto(t *testing.T) {
	in := json.RawMessage(`{"kiosk":{"serviceGridLayout":"auto","foo":1}}`)
	out := mergeDefaultKioskServiceGridLayoutAuto(in)
	var m map[string]json.RawMessage
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	var k map[string]any
	if err := json.Unmarshal(m["kiosk"], &k); err != nil {
		t.Fatal(err)
	}
	if k["serviceGridLayout"] != "auto" {
		t.Fatalf("serviceGridLayout = %v, want auto unchanged", k["serviceGridLayout"])
	}
}

func TestMergeDefaultKioskServiceGridLayoutAuto_injectsManualWhenMissing(t *testing.T) {
	in := json.RawMessage(`{"kiosk":{"theme":"dark"}}`)
	out := mergeDefaultKioskServiceGridLayoutAuto(in)
	var m map[string]json.RawMessage
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	var k map[string]any
	if err := json.Unmarshal(m["kiosk"], &k); err != nil {
		t.Fatal(err)
	}
	if k["serviceGridLayout"] != "manual" {
		t.Fatalf("serviceGridLayout = %v, want manual", k["serviceGridLayout"])
	}
	if k["theme"] != "dark" {
		t.Fatalf("theme = %v, want dark", k["theme"])
	}
}
