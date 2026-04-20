package commerceml

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// OneCStatusMapping configures how 1C УНФ order status strings (CommerceML Документ/Статус)
// map to Invoice.status. Rules are evaluated in order; the first matching rule wins.
// When Rules is empty or JSON is unset, ResolveInvoiceStatus falls back to StatusLooksPaid → paid only.
type OneCStatusMapping struct {
	Rules []OneCStatusMappingRule `json:"rules"`
}

// OneCStatusMappingRule matches a 1C status string (trimmed) against Contains (substring, case-insensitive)
// or Equals (exact, case-sensitive after trim of pattern only — 1C value trimmed).
type OneCStatusMappingRule struct {
	Contains      string `json:"contains,omitempty"`
	Equals        string `json:"equals,omitempty"`
	InvoiceStatus string `json:"invoiceStatus"` // paid | void | uncollectible
}

// AllowedOneCMapInvoiceStatuses are the only targets allowed from CommerceML import.
var AllowedOneCMapInvoiceStatuses = map[string]struct{}{
	"paid":          {},
	"void":          {},
	"uncollectible": {},
}

// ValidateOneCStatusMapping returns an error if JSON is invalid or rules are inconsistent.
func ValidateOneCStatusMapping(raw []byte) error {
	if len(raw) == 0 {
		return nil
	}
	var m OneCStatusMapping
	if err := json.Unmarshal(raw, &m); err != nil {
		return err
	}
	for i := range m.Rules {
		r := m.Rules[i]
		invSt := strings.TrimSpace(r.InvoiceStatus)
		if invSt == "" {
			return errors.New("onec status mapping: invoiceStatus is required")
		}
		if _, ok := AllowedOneCMapInvoiceStatuses[invSt]; !ok {
			return fmt.Errorf("onec status mapping: invoiceStatus must be paid, void, or uncollectible, got %q", r.InvoiceStatus)
		}
		if strings.TrimSpace(r.Contains) == "" && strings.TrimSpace(r.Equals) == "" {
			return errors.New("onec status mapping: each rule needs contains or equals")
		}
	}
	return nil
}

// ResolveInvoiceStatus maps a 1C status string to a target invoice status.
// second return is false when no mapping applies (caller should skip the document).
func ResolveInvoiceStatus(onecStatus string, mappingJSON []byte) (invoiceStatus string, ok bool) {
	s := strings.TrimSpace(onecStatus)
	if len(mappingJSON) > 0 {
		var m OneCStatusMapping
		if err := json.Unmarshal(mappingJSON, &m); err == nil && len(m.Rules) > 0 {
			for i := range m.Rules {
				r := m.Rules[i]
				target := strings.TrimSpace(r.InvoiceStatus)
				if _, allowed := AllowedOneCMapInvoiceStatuses[target]; !allowed {
					continue
				}
				if eq := strings.TrimSpace(r.Equals); eq != "" && strings.TrimSpace(s) == eq {
					return target, true
				}
				if sub := strings.TrimSpace(r.Contains); sub != "" {
					if strings.Contains(strings.ToLower(s), strings.ToLower(sub)) {
						return target, true
					}
				}
			}
			return "", false
		}
	}
	if StatusLooksPaid(s) {
		return "paid", true
	}
	return "", false
}
