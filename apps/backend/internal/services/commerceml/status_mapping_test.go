package commerceml

import (
	"encoding/json"
	"testing"
)

func TestResolveInvoiceStatus_DefaultHeuristic(t *testing.T) {
	got, ok := ResolveInvoiceStatus("Полностью оплачен", nil)
	if !ok || got != "paid" {
		t.Fatalf("expected paid, ok; got %q, %v", got, ok)
	}
	got, ok = ResolveInvoiceStatus("новый", nil)
	if ok {
		t.Fatalf("expected no match; got %q", got)
	}
}

func TestResolveInvoiceStatus_CustomRules(t *testing.T) {
	raw, _ := json.Marshal(OneCStatusMapping{
		Rules: []OneCStatusMappingRule{
			{Contains: "отмен", InvoiceStatus: "void"},
			{Equals: "OK", InvoiceStatus: "paid"},
		},
	})
	got, ok := ResolveInvoiceStatus("Заказ отменён", raw)
	if !ok || got != "void" {
		t.Fatalf("expected void; got %q, %v", got, ok)
	}
	got, ok = ResolveInvoiceStatus("OK", raw)
	if !ok || got != "paid" {
		t.Fatalf("expected paid; got %q, %v", got, ok)
	}
	got, ok = ResolveInvoiceStatus("Полностью оплачен", raw)
	if ok {
		t.Fatalf("custom rules present: legacy paid heuristic must not apply; got %q", got)
	}
}

func TestValidateOneCStatusMapping(t *testing.T) {
	if err := ValidateOneCStatusMapping([]byte(`{"rules":[{"contains":"x","invoiceStatus":"paid"}]}`)); err != nil {
		t.Fatal(err)
	}
	if err := ValidateOneCStatusMapping([]byte(`{"rules":[{"invoiceStatus":"paid"}]}`)); err == nil {
		t.Fatal("expected error: missing contains/equals")
	}
	if err := ValidateOneCStatusMapping([]byte(`{"rules":[{"contains":"a","invoiceStatus":"open"}]}`)); err == nil {
		t.Fatal("expected error: invalid invoice status")
	}
}
