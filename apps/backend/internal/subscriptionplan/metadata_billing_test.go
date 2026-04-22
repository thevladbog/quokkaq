package subscriptionplan

import (
	"encoding/json"
	"testing"
)

func TestMergePreferredBillingFromCheckout_annualPreservesKeys(t *testing.T) {
	existing := json.RawMessage(`{"foo":"bar"}`)
	out, err := MergePreferredBillingFromCheckout(existing, "annual")
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if m["foo"] != "bar" {
		t.Fatalf("foo: got %#v", m["foo"])
	}
	if m["preferredBillingPeriod"] != "annual" {
		t.Fatalf("preferredBillingPeriod: got %#v", m["preferredBillingPeriod"])
	}
}

func TestMergePreferredBillingFromCheckout_nonAnnualNoOp(t *testing.T) {
	existing := json.RawMessage(`{"preferredBillingPeriod":"annual"}`)
	out, err := MergePreferredBillingFromCheckout(existing, "month")
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(existing) {
		t.Fatalf("expected unchanged, got %s", string(out))
	}
}

func TestMetadataPrefersAnnual(t *testing.T) {
	if !MetadataPrefersAnnual(json.RawMessage(`{"preferredBillingPeriod":"annual"}`)) {
		t.Fatal("expected true")
	}
	if MetadataPrefersAnnual(json.RawMessage(`{"preferredBillingPeriod":"month"}`)) {
		t.Fatal("expected false")
	}
}
