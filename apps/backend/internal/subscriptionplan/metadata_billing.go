package subscriptionplan

import (
	"encoding/json"
	"strings"
)

// MergePreferredBillingFromCheckout merges Stripe checkout billing intent into subscription metadata JSON.
// When checkoutBillingPeriod is "annual", sets preferredBillingPeriod to "annual" (same key as signup).
// Other values leave metadata unchanged. Preserves unrelated keys in the JSON object.
func MergePreferredBillingFromCheckout(existing json.RawMessage, checkoutBillingPeriod string) (json.RawMessage, error) {
	bp := strings.TrimSpace(strings.ToLower(checkoutBillingPeriod))
	if bp != "annual" {
		return existing, nil
	}
	m := map[string]interface{}{}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &m); err != nil {
			return nil, err
		}
	}
	if m == nil {
		m = map[string]interface{}{}
	}
	m["preferredBillingPeriod"] = "annual"
	return json.Marshal(m)
}

// MetadataPrefersAnnual returns true when subscription metadata JSON contains preferredBillingPeriod: "annual".
func MetadataPrefersAnnual(metadata json.RawMessage) bool {
	if len(metadata) == 0 {
		return false
	}
	var m map[string]interface{}
	if err := json.Unmarshal(metadata, &m); err != nil {
		return false
	}
	v, ok := m["preferredBillingPeriod"]
	if !ok || v == nil {
		return false
	}
	s, ok := v.(string)
	return ok && strings.EqualFold(strings.TrimSpace(s), "annual")
}
