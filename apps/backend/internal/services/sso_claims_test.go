package services

import (
	"errors"
	"testing"
)

func TestParseOIDCUserClaimsFromRawMap_entraOverage(t *testing.T) {
	t.Parallel()
	base := map[string]interface{}{
		"email":          "a@x.com",
		"email_verified": true,
		"name":           "A",
		"oid":            "obj-1",
	}
	t.Run("hasgroups_true_empty_groups", func(t *testing.T) {
		t.Parallel()
		raw := cloneRaw(base)
		raw["hasgroups"] = true
		out, err := parseOIDCUserClaimsFromRawMap(raw)
		if !errors.Is(err, ErrOIDCGroupsClaimOverage) {
			t.Fatalf("err = %v, want ErrOIDCGroupsClaimOverage", err)
		}
		if out == nil || out.Email != "a@x.com" {
			t.Fatalf("out = %#v", out)
		}
	})
	t.Run("claim_names_empty_groups", func(t *testing.T) {
		t.Parallel()
		raw := cloneRaw(base)
		raw["_claim_names"] = map[string]interface{}{"groups": "src1"}
		out, err := parseOIDCUserClaimsFromRawMap(raw)
		if !errors.Is(err, ErrOIDCGroupsClaimOverage) {
			t.Fatalf("err = %v", err)
		}
		if out.Email != "a@x.com" {
			t.Fatalf("email = %q", out.Email)
		}
	})
	t.Run("claim_sources_empty_groups", func(t *testing.T) {
		t.Parallel()
		raw := cloneRaw(base)
		raw["_claim_sources"] = map[string]interface{}{"src1": map[string]interface{}{}}
		out, err := parseOIDCUserClaimsFromRawMap(raw)
		if !errors.Is(err, ErrOIDCGroupsClaimOverage) {
			t.Fatalf("err = %v", err)
		}
		if out == nil {
			t.Fatal("nil out")
		}
	})
	t.Run("hasgroups_with_groups_still_ok", func(t *testing.T) {
		t.Parallel()
		raw := cloneRaw(base)
		raw["hasgroups"] = true
		raw["groups"] = []interface{}{"g1"}
		out, err := parseOIDCUserClaimsFromRawMap(raw)
		if err != nil {
			t.Fatal(err)
		}
		if len(out.Groups) != 1 || out.Groups[0] != "g1" {
			t.Fatalf("groups = %#v", out.Groups)
		}
	})
	t.Run("empty_groups_no_indicators_ok", func(t *testing.T) {
		t.Parallel()
		raw := cloneRaw(base)
		out, err := parseOIDCUserClaimsFromRawMap(raw)
		if err != nil {
			t.Fatal(err)
		}
		if len(out.Groups) != 0 {
			t.Fatalf("want empty groups, got %#v", out.Groups)
		}
	})
}

func cloneRaw(m map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
