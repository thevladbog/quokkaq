package models

import "testing"

func TestUnitDisplayName(t *testing.T) {
	en := "Branch EN"
	emptyEn := ""
	tests := []struct {
		name   string
		unit   *Unit
		locale string
		want   string
	}{
		{
			name:   "nil unit",
			unit:   nil,
			locale: "en",
			want:   "",
		},
		{
			name:   "en uses NameEn",
			unit:   &Unit{Name: "Филиал", NameEn: &en},
			locale: "en",
			want:   "Branch EN",
		},
		{
			name:   "en-US uses NameEn",
			unit:   &Unit{Name: "Филиал", NameEn: &en},
			locale: "en-US",
			want:   "Branch EN",
		},
		{
			name:   "ru uses Name",
			unit:   &Unit{Name: "Филиал", NameEn: &en},
			locale: "ru",
			want:   "Филиал",
		},
		{
			name:   "fr falls back to Name",
			unit:   &Unit{Name: "Филиал", NameEn: &en},
			locale: "fr",
			want:   "Филиал",
		},
		{
			name:   "empty locale falls back to Name",
			unit:   &Unit{Name: "Филиал", NameEn: &en},
			locale: "",
			want:   "Филиал",
		},
		{
			name:   "english NameEn empty string falls back to Name",
			unit:   &Unit{Name: "Only RU", NameEn: &emptyEn},
			locale: "en",
			want:   "Only RU",
		},
		{
			name:   "only RU name for en locale",
			unit:   &Unit{Name: "Only RU"},
			locale: "en",
			want:   "Only RU",
		},
		{
			name:   "english does not match english substring",
			unit:   &Unit{Name: "Main", NameEn: &en},
			locale: "english",
			want:   "Main",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := UnitDisplayName(tt.unit, tt.locale); got != tt.want {
				t.Fatalf("UnitDisplayName() = %q, want %q", got, tt.want)
			}
		})
	}
}
