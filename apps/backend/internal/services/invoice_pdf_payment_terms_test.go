package services

import (
	"strings"
	"testing"
)

func TestInvoiceMarkdownToPlainForPDF(t *testing.T) {
	in := "## Title\n\n- one **bold** item\n\n[click](https://x.y)"
	got := invoiceMarkdownToPlainForPDF(in)
	if got == "" {
		t.Fatal("expected non-empty")
	}
	for _, want := range []string{"Title", "bold", "click"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in %q", want, got)
		}
	}
	if strings.Contains(got, "**") || strings.Contains(got, "https://") {
		t.Fatalf("expected stripped markup: %q", got)
	}
}
