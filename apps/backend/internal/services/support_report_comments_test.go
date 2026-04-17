package services

import (
	"testing"
	"time"
)

func TestParseYandexTrackerTime_plus0000NoColon(t *testing.T) {
	raw := "2017-06-11T05:11:12.347+0000"
	got := parseYandexTrackerTime(raw)
	want := time.Date(2017, 6, 11, 5, 11, 12, 347000000, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("parse %q: got %v want %v", raw, got, want)
	}
}
