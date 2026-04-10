package services

import (
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func TestInvoicePDFDownloadSuffixIsValid(t *testing.T) {
	tests := []struct {
		s    string
		want bool
	}{
		{"", false},
		{"1234567", false},
		{"123456789", false},
		{"abcdef12", true},
		{"ABCDEF12", true},
		{"AbCdEf12", true},
		{"00000000", true},
		{"gabcdef1", false},
		{"........", false},
		{"  abcd12", false},
	}
	for _, tt := range tests {
		if got := invoicePDFDownloadSuffixIsValid(tt.s); got != tt.want {
			t.Errorf("invoicePDFDownloadSuffixIsValid(%q) = %v, want %v", tt.s, got, tt.want)
		}
	}
}

func TestInvoicePDFEmbedDownloadSuffix(t *testing.T) {
	if got := invoicePDFEmbedDownloadSuffix("a1b2c3d4"); got != "a1b2c3d4" {
		t.Errorf("valid hex: got %q", got)
	}
	if got := invoicePDFEmbedDownloadSuffix("A1B2C3D4"); got != "A1B2C3D4" {
		t.Errorf("valid hex uppercase preserved: got %q", got)
	}
	if got := invoicePDFEmbedDownloadSuffix("notahex!"); got != "00000000" {
		t.Errorf("invalid: got %q", got)
	}
}

func TestInvoicePDFUTF8Filename_keepsValidHexSuffix(t *testing.T) {
	inv := &models.Invoice{
		ID:        "inv-1",
		CreatedAt: time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
	}
	suffix := "a1b2c3d4"
	name := InvoicePDFUTF8Filename(inv, suffix)
	if !strings.HasSuffix(name, "_"+suffix+".pdf") {
		t.Fatalf("expected suffix %q in name %q", suffix, name)
	}
}

func TestInvoicePDFUTF8Filename_invalidSuffixUsesZeros(t *testing.T) {
	inv := &models.Invoice{
		ID:        "inv-1",
		CreatedAt: time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
	}
	name := InvoicePDFUTF8Filename(inv, "........")
	if !strings.HasSuffix(name, "_00000000.pdf") {
		t.Fatalf("expected fallback zeros, got %q", name)
	}
}
