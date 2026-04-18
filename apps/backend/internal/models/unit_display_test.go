package models

import "testing"

func TestUnitDisplayName(t *testing.T) {
	en := "Branch EN"
	u := &Unit{Name: "Филиал", NameEn: &en}
	if got := UnitDisplayName(u, "en"); got != "Branch EN" {
		t.Fatalf("en: got %q", got)
	}
	if got := UnitDisplayName(u, "ru"); got != "Филиал" {
		t.Fatalf("ru: got %q", got)
	}
	if got := UnitDisplayName(u, "en-US"); got != "Branch EN" {
		t.Fatalf("en-US: got %q", got)
	}
	u2 := &Unit{Name: "Only RU"}
	if got := UnitDisplayName(u2, "en"); got != "Only RU" {
		t.Fatalf("fallback: got %q", got)
	}
}
