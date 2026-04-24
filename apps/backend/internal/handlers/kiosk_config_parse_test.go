package handlers

import (
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestKioskVisitorSMSAfterTicketEnabled(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		unit *models.Unit
		want bool
	}{
		{
			name: "nil unit defaults true",
			unit: nil,
			want: true,
		},
		{
			name: "empty config defaults true",
			unit: &models.Unit{Config: nil},
			want: true,
		},
		{
			name: "invalid json defaults true",
			unit: &models.Unit{Config: []byte(`{`)},
			want: true,
		},
		{
			name: "no kiosk key defaults true",
			unit: &models.Unit{Config: mustJSON(t, map[string]any{"other": true})},
			want: true,
		},
		{
			name: "kiosk empty object defaults true",
			unit: &models.Unit{Config: mustJSON(t, map[string]any{"kiosk": map[string]any{}})},
			want: true,
		},
		{
			name: "visitorSmsAfterTicket false",
			unit: &models.Unit{Config: mustJSON(t, map[string]any{
				"kiosk": map[string]any{"visitorSmsAfterTicket": false},
			})},
			want: false,
		},
		{
			name: "visitorSmsAfterTicket true",
			unit: &models.Unit{Config: mustJSON(t, map[string]any{
				"kiosk": map[string]any{"visitorSmsAfterTicket": true},
			})},
			want: true,
		},
		{
			name: "non-bool value ignored defaults true",
			unit: &models.Unit{Config: mustJSON(t, map[string]any{
				"kiosk": map[string]any{"visitorSmsAfterTicket": "no"},
			})},
			want: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := kioskVisitorSMSAfterTicketEnabled(tc.unit)
			if got != tc.want {
				t.Errorf("kioskVisitorSMSAfterTicketEnabled() = %v, want %v", got, tc.want)
			}
		})
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return b
}
