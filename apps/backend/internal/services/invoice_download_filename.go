package services

import (
	"crypto/rand"
	"encoding/hex"
	"strings"

	"quokkaq-go-backend/internal/models"
)

func sanitizeFilePart(s string) string {
	repl := strings.NewReplacer(
		`/`, "_", `\`, "_", `:`, "_", `*`, "_", `?`, "_",
		`"`, "_", `<`, "_", `>`, "_", `|`, "_",
	)
	s = repl.Replace(strings.TrimSpace(s))
	if s == "" {
		return "NA"
	}
	return s
}

// asciiFilePart keeps printable ASCII safe for filename="..." in Content-Disposition.
func asciiFilePart(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "._")
	if out == "" {
		return "doc"
	}
	return out
}

func invoiceDocLabelForFile(inv *models.Invoice) string {
	if inv.DocumentNumber != nil {
		if s := strings.TrimSpace(*inv.DocumentNumber); s != "" {
			return s
		}
	}
	id := inv.ID
	if len(id) > 8 {
		id = id[:8]
	}
	return id
}

func invoiceDateKeyForFile(inv *models.Invoice) string {
	if inv.IssuedAt != nil {
		return inv.IssuedAt.Format("2006-01-02")
	}
	return inv.CreatedAt.Format("2006-01-02")
}

// InvoicePDFDownloadSuffix returns 8 random hex chars (new value on every call — use when building download filename).
func InvoicePDFDownloadSuffix() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// invoicePDFDownloadSuffixIsValid is true when s is exactly eight ASCII hex digits (same contract as [InvoicePDFDownloadSuffix]).
func invoicePDFDownloadSuffixIsValid(s string) bool {
	if len(s) != 8 {
		return false
	}
	for i := 0; i < 8; i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

// invoicePDFEmbedDownloadSuffix validates the raw suffix, then applies [asciiFilePart] for safe embedding.
// If the raw suffix is invalid, returns "00000000". If it is valid but [asciiFilePart] changes length (edge case), returns a lowercase copy of the raw suffix (still ASCII-safe).
func invoicePDFEmbedDownloadSuffix(downloadSuffix string) string {
	if !invoicePDFDownloadSuffixIsValid(downloadSuffix) {
		return "00000000"
	}
	h := asciiFilePart(downloadSuffix)
	if len(h) != 8 {
		return strings.ToLower(downloadSuffix)
	}
	return h
}

// InvoicePDFUTF8Filename is Счет_на_оплату_{Номер}_От_{дата}_{суффикс}.pdf
func InvoicePDFUTF8Filename(inv *models.Invoice, downloadSuffix string) string {
	doc := sanitizeFilePart(invoiceDocLabelForFile(inv))
	date := sanitizeFilePart(invoiceDateKeyForFile(inv))
	h := invoicePDFEmbedDownloadSuffix(downloadSuffix)
	return "Счет_на_оплату_" + doc + "_От_" + date + "_" + h + ".pdf"
}

// InvoicePDFASCIIFilename is a safe fallback for Content-Disposition filename=.
func InvoicePDFASCIIFilename(inv *models.Invoice, downloadSuffix string) string {
	doc := asciiFilePart(sanitizeFilePart(invoiceDocLabelForFile(inv)))
	date := asciiFilePart(sanitizeFilePart(invoiceDateKeyForFile(inv)))
	h := invoicePDFEmbedDownloadSuffix(downloadSuffix)
	return "Schet_na_oplatu_" + doc + "_Ot_" + date + "_" + h + ".pdf"
}
