package middleware

import "testing"

func TestNormalizeUnitIDParam(t *testing.T) {
	t.Parallel()
	if got := normalizeUnitIDParam("  ABC-123  "); got != "abc-123" {
		t.Fatalf("got %q want abc-123", got)
	}
	if got := normalizeUnitIDParam(""); got != "" {
		t.Fatalf("got %q want empty", got)
	}
}
