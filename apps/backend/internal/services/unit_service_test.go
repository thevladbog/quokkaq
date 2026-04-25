package services

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestEnsureDefaultKioskServiceGridLayout(t *testing.T) {
	tests := []struct {
		name                   string
		in                     json.RawMessage
		wantLayout             string
		wantTheme              *string
		wantFoo                *float64
		expectExactPassthrough bool
	}{
		{
			name:       "nil config injects manual",
			in:         nil,
			wantLayout: "manual",
		},
		{
			name:       "json null injects manual",
			in:         json.RawMessage("null"),
			wantLayout: "manual",
		},
		{
			name:       "empty object injects manual",
			in:         json.RawMessage(`{}`),
			wantLayout: "manual",
		},
		{
			name:                   "non-object kiosk is preserved",
			in:                     json.RawMessage(`{"kiosk":"nope"}`),
			expectExactPassthrough: true,
		},
		{
			name:       "preserves explicit auto and siblings",
			in:         json.RawMessage(`{"kiosk":{"serviceGridLayout":"auto","foo":1}}`),
			wantLayout: "auto",
			wantFoo:    ptrFloat64(1),
		},
		{
			name:       "injects manual when missing and preserves siblings",
			in:         json.RawMessage(`{"kiosk":{"theme":"dark"}}`),
			wantLayout: "manual",
			wantTheme:  ptrString("dark"),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			out := ensureDefaultKioskServiceGridLayout(tc.in)
			if tc.expectExactPassthrough {
				if !bytes.Equal(out, tc.in) {
					t.Fatalf("want unchanged %s, got %s", tc.in, out)
				}
				return
			}

			var m map[string]any
			if err := json.Unmarshal(out, &m); err != nil {
				t.Fatal(err)
			}
			k, ok := m["kiosk"].(map[string]any)
			if !ok {
				t.Fatalf("expected kiosk object, got %T", m["kiosk"])
			}
			if k["serviceGridLayout"] != tc.wantLayout {
				t.Fatalf("serviceGridLayout = %v, want %s", k["serviceGridLayout"], tc.wantLayout)
			}
			if tc.wantTheme != nil && k["theme"] != *tc.wantTheme {
				t.Fatalf("theme = %v, want %s", k["theme"], *tc.wantTheme)
			}
			if tc.wantFoo != nil {
				if k["foo"] != *tc.wantFoo {
					t.Fatalf("foo = %v, want %v", k["foo"], *tc.wantFoo)
				}
			}
		})
	}
}

func ptrString(v string) *string    { return &v }
func ptrFloat64(v float64) *float64 { return &v }
