package commerceml

import (
	"encoding/xml"
	"strings"
)

// OrderDocHint is a minimal Документ slice from incoming CommerceML (POC).
type OrderDocHint struct {
	ID     string
	Status string
}

type commercialInfoImport struct {
	Docs []struct {
		ID     string `xml:"Ид"`
		Status string `xml:"Статус"`
	} `xml:"Документ"`
}

// ParseOrderDocuments extracts document Ид and optional Статус from CommerceML (POC).
func ParseOrderDocuments(xmlBytes []byte) ([]OrderDocHint, error) {
	var root commercialInfoImport
	if err := xml.Unmarshal(xmlBytes, &root); err != nil {
		return nil, err
	}
	out := make([]OrderDocHint, 0, len(root.Docs))
	for i := range root.Docs {
		id := strings.TrimSpace(root.Docs[i].ID)
		if id == "" {
			continue
		}
		out = append(out, OrderDocHint{ID: id, Status: strings.TrimSpace(root.Docs[i].Status)})
	}
	return out, nil
}

// StatusLooksPaid returns true for common Russian 1С / exchange status strings (POC).
// Negative phrases (e.g. "не оплачен", "unpaid") are rejected before positive checks.
func StatusLooksPaid(status string) bool {
	s := strings.ToLower(strings.TrimSpace(status))
	if s == "" {
		return false
	}
	negatives := []string{
		"не оплачен", "неоплачен", "не полностью оплачен", "частично оплачен",
		"unpaid", "partially paid", "not paid",
	}
	for _, n := range negatives {
		if strings.Contains(s, n) {
			return false
		}
	}
	if strings.Contains(s, "оплачен") || strings.Contains(s, "полностью оплачен") {
		return true
	}
	if strings.Contains(s, "paid") {
		return true
	}
	return false
}
