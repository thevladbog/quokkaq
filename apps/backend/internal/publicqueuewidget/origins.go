package publicqueuewidget

import (
	"encoding/json"
	"strings"
)

const settingsKeyOrigins = "publicQueueWidgetAllowedOrigins"

// AllowedOriginsFromCompanySettings parses optional CORS allowlist from company.settings JSON.
func AllowedOriginsFromCompanySettings(raw []byte) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	b, ok := m[settingsKeyOrigins]
	if !ok || len(b) == 0 || string(b) == "null" {
		return nil
	}
	var arr []string
	if err := json.Unmarshal(b, &arr); err != nil {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, o := range arr {
		o = strings.TrimSpace(o)
		if o != "" {
			out = append(out, o)
		}
	}
	return out
}
