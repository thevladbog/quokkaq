package publicqueuewidget

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// ValidateAllowedOrigin checks a browser Origin-style URL (scheme + host, optional port; no path).
func ValidateAllowedOrigin(origin string) error {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return fmt.Errorf("origin cannot be empty")
	}
	u, err := url.Parse(origin)
	if err != nil {
		return err
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("origin must use http or https")
	}
	if u.Host == "" {
		return fmt.Errorf("origin must include host")
	}
	if u.Path != "" && u.Path != "/" {
		return fmt.Errorf("origin must not include a path")
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("origin must not include query or fragment")
	}
	if u.User != nil {
		return fmt.Errorf("origin must not include userinfo")
	}
	return nil
}

// MergeAllowedOriginsIntoCompanySettings returns updated company.settings JSON with publicQueueWidgetAllowedOrigins set.
func MergeAllowedOriginsIntoCompanySettings(settings json.RawMessage, origins []string) (json.RawMessage, error) {
	for _, o := range origins {
		if err := ValidateAllowedOrigin(o); err != nil {
			return nil, fmt.Errorf("%q: %w", o, err)
		}
	}
	var m map[string]json.RawMessage
	if len(settings) > 0 && string(settings) != "null" {
		if err := json.Unmarshal(settings, &m); err != nil {
			return nil, err
		}
	}
	if m == nil {
		m = make(map[string]json.RawMessage)
	}
	b, err := json.Marshal(origins)
	if err != nil {
		return nil, err
	}
	m[settingsKeyOrigins] = json.RawMessage(b)
	return json.Marshal(m)
}
