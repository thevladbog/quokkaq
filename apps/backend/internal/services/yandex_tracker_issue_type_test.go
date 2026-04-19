package services

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestAppendYandexTrackerIssueTypeField(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		raw    string
		want   interface{}
		wantOK bool
	}{
		{"empty omits", "", nil, false},
		{"whitespace omits", "   ", nil, false},
		{"numeric id int", "42", int64(42), true},
		{"numeric id trimmed", " 42 ", int64(42), true},
		{"key string", "task", "task", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			payload := map[string]interface{}{"queue": "Q"}
			appendYandexTrackerIssueTypeField(payload, tc.raw)
			if !tc.wantOK {
				if _, ok := payload["type"]; ok {
					t.Fatalf("expected type omitted, got %v", payload["type"])
				}
				return
			}
			if payload["type"] != tc.want {
				t.Fatalf("type: got %#v want %#v", payload["type"], tc.want)
			}
		})
	}
}

func TestResolveSupportTrackerQueue(t *testing.T) {
	t.Run("db wins", func(t *testing.T) {
		t.Parallel()
		q := ResolveSupportTrackerQueue(&models.DeploymentSaaSSettings{SupportTrackerQueue: "  DBQ  "})
		if q != "DBQ" {
			t.Fatalf("got %q", q)
		}
	})
	t.Run("env fallback", func(t *testing.T) {
		t.Setenv("YANDEX_TRACKER_QUEUE", "ENVQ")
		q := ResolveSupportTrackerQueue(&models.DeploymentSaaSSettings{})
		if q != "ENVQ" {
			t.Fatalf("got %q", q)
		}
	})
	t.Run("nil settings uses env", func(t *testing.T) {
		t.Setenv("YANDEX_TRACKER_QUEUE", "ONLYENV")
		q := ResolveSupportTrackerQueue(nil)
		if q != "ONLYENV" {
			t.Fatalf("got %q", q)
		}
	})
}
