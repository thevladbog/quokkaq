package publicqueuewidget

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidateAllowedOrigin_errors(t *testing.T) {
	cases := []struct {
		in  string
		sub string
	}{
		{"", "empty"},
		{"ftp://example.com", "scheme"},
		{"https://host/path/extra", "path"},
		{"https://host?x=1", "query"},
		{"https://host#frag", "fragment"},
		{"https://user:pass@host", "userinfo"},
	}
	for _, tc := range cases {
		t.Run(tc.sub, func(t *testing.T) {
			err := ValidateAllowedOrigin(tc.in)
			if err == nil {
				t.Fatalf("expected error for %q", tc.in)
			}
		})
	}
}

func TestValidateAllowedOrigin_ok(t *testing.T) {
	for _, o := range []string{"https://a.example", "http://localhost:3000"} {
		if err := ValidateAllowedOrigin(o); err != nil {
			t.Errorf("%q: %v", o, err)
		}
	}
}

func TestMergeAllowedOriginsIntoCompanySettings_invalidOrigin(t *testing.T) {
	_, err := MergeAllowedOriginsIntoCompanySettings(nil, []string{"https://ok.example", "not-a-url"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "not-a-url") {
		t.Fatalf("unexpected err: %v", err)
	}
}

func TestMergeAllowedOriginsIntoCompanySettings_mergesAndPreserves(t *testing.T) {
	base := json.RawMessage(`{"otherKey":true,"` + settingsKeyOrigins + `":["https://old.example"]}`)
	out, err := MergeAllowedOriginsIntoCompanySettings(base, []string{"https://new.example"})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	var other bool
	if err := json.Unmarshal(m["otherKey"], &other); err != nil || !other {
		t.Fatalf("otherKey: want true, got err=%v raw=%s", err, string(m["otherKey"]))
	}
	var origins []string
	if err := json.Unmarshal(m[settingsKeyOrigins], &origins); err != nil {
		t.Fatal(err)
	}
	if len(origins) != 1 || origins[0] != "https://new.example" {
		t.Fatalf("origins: %v", origins)
	}
}
