package services

import (
	"encoding/json"
	"testing"
)

func TestEnsureDefaultKioskServiceGridLayout_emptyConfig(t *testing.T) {
	out := ensureDefaultKioskServiceGridLayout(nil)
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

func TestEnsureDefaultKioskServiceGridLayout_jsonNull(t *testing.T) {
	out := ensureDefaultKioskServiceGridLayout(json.RawMessage("null"))
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

func TestEnsureDefaultKioskServiceGridLayout_nonObjectKioskPreserved(t *testing.T) {
	in := json.RawMessage(`{"kiosk":"nope"}`)
	out := ensureDefaultKioskServiceGridLayout(in)
	if string(out) != string(in) {
		t.Fatalf("want unchanged %s, got %s", in, out)
	}
}

func TestEnsureDefaultKioskServiceGridLayout_preservesExplicitAuto(t *testing.T) {
	in := json.RawMessage(`{"kiosk":{"serviceGridLayout":"auto","foo":1}}`)
	out := ensureDefaultKioskServiceGridLayout(in)
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

func TestEnsureDefaultKioskServiceGridLayout_injectsManualWhenMissing(t *testing.T) {
	in := json.RawMessage(`{"kiosk":{"theme":"dark"}}`)
	out := ensureDefaultKioskServiceGridLayout(in)
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
