package services

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func TestYMDStringFromDatePtr(t *testing.T) {
	d := time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC)
	if g, w := ymdStringFromDatePtr(&d), "2025-03-15"; g != w {
		t.Fatalf("got %q want %q", g, w)
	}
}

func TestScheduleInCalendarWindow(t *testing.T) {
	vf := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	vt := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)
	s := &models.PlaylistSchedule{ValidFrom: &vf, ValidTo: &vt}
	if !scheduleInCalendarWindow(s, "2025-01-10") {
		t.Fatal("expected true inside")
	}
	if scheduleInCalendarWindow(s, "2024-12-01") {
		t.Fatal("expected false before from")
	}
	if scheduleInCalendarWindow(s, "2025-02-01") {
		t.Fatal("expected false after to")
	}
}

func TestFilterActivePlaylistItems(t *testing.T) {
	v0 := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	v1 := time.Date(2030, 12, 31, 0, 0, 0, 0, time.UTC)
	ended2019 := time.Date(2019, 12, 31, 0, 0, 0, 0, time.UTC)
	p := &models.Playlist{Items: []models.PlaylistItem{
		{ID: "a", ValidFrom: &v0, ValidTo: &v1},
		{ID: "b", ValidFrom: &v0, ValidTo: &ended2019},
	}}
	out := filterActivePlaylistItems(p, "2019-12-01")
	if len(out.Items) != 0 {
		t.Fatalf("want 0 items, got %d", len(out.Items))
	}
	out2 := filterActivePlaylistItems(p, "2020-01-01")
	if len(out2.Items) != 1 || out2.Items[0].ID != "a" {
		t.Fatalf("unexpected: %+v", out2.Items)
	}
}
