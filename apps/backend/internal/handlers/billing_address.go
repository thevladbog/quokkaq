package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
)

// normalizeBillingAddressJSON returns nil when billingAddress should be cleared, or the same raw
// bytes when it is a non-empty JSON object. Rejects arrays, primitives, and non-empty non-objects.
func normalizeBillingAddressJSON(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if string(bytes.TrimSpace(raw)) == "null" {
		return nil, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, errors.New("billingAddress must be a JSON object")
	}
	if m == nil {
		return nil, nil
	}
	if len(m) == 0 {
		return nil, nil
	}
	return raw, nil
}
