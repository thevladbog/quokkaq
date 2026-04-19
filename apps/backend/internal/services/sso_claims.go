package services

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

// ErrOIDCGroupsClaimOverage is returned when the IdP omitted the "groups" claim due to size limits
// (e.g. Microsoft Entra overage: hasgroups / _claim_names / _claim_sources). Callers must not treat
// an empty group list as authoritative; defer reconciliation or fetch groups via Graph API.
var ErrOIDCGroupsClaimOverage = errors.New("oidc: groups claim omitted (token overage); group reconciliation deferred")

// OIDCUserClaims holds optional fields used for directory sync beyond basic email/name.
type OIDCUserClaims struct {
	Email         string
	EmailVerified bool
	Name          string
	Nonce         string
	Groups        []string
	ObjectID      string // Entra "oid"
}

// ParseOIDCClaimsFromIDToken extracts groups and oid after successful verification.
// If Microsoft Entra omitted "groups" due to overage (hasgroups / _claim_names / _claim_sources),
// returns ErrOIDCGroupsClaimOverage together with a populated OIDCUserClaims (groups left empty).
func ParseOIDCClaimsFromIDToken(idToken *oidc.IDToken) (*OIDCUserClaims, error) {
	var raw map[string]interface{}
	if err := idToken.Claims(&raw); err != nil {
		return nil, err
	}
	return parseOIDCUserClaimsFromRawMap(raw)
}

func parseOIDCUserClaimsFromRawMap(raw map[string]interface{}) (*OIDCUserClaims, error) {
	out := &OIDCUserClaims{}
	if v, ok := raw["email"].(string); ok {
		out.Email = v
	}
	switch v := raw["email_verified"].(type) {
	case bool:
		out.EmailVerified = v
	case string:
		out.EmailVerified = strings.EqualFold(strings.TrimSpace(v), "true")
	}
	if v, ok := raw["name"].(string); ok {
		out.Name = v
	}
	if v, ok := raw["nonce"].(string); ok {
		out.Nonce = v
	}
	if v, ok := raw["oid"].(string); ok {
		out.ObjectID = strings.TrimSpace(v)
	}
	groups := extractGroupsFromClaimRaw(raw["groups"])
	if len(groups) == 0 && entraGroupsClaimOverageIndicators(raw) {
		return out, ErrOIDCGroupsClaimOverage
	}
	out.Groups = groups
	return out, nil
}

func entraGroupsClaimOverageIndicators(raw map[string]interface{}) bool {
	if claimIsTruthy(raw["hasgroups"]) {
		return true
	}
	if v, ok := raw["_claim_names"]; ok && v != nil {
		return true
	}
	if v, ok := raw["_claim_sources"]; ok && v != nil {
		return true
	}
	return false
}

func claimIsTruthy(v interface{}) bool {
	if v == nil {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return strings.EqualFold(strings.TrimSpace(t), "true")
	default:
		return false
	}
}

func extractGroupsFromClaimRaw(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return nil
		}
		return []string{s}
	case []interface{}:
		out := make([]string, 0, len(t))
		seen := make(map[string]struct{})
		for _, x := range t {
			s, ok := x.(string)
			if !ok {
				continue
			}
			s = strings.TrimSpace(s)
			if s == "" {
				continue
			}
			if _, dup := seen[s]; dup {
				continue
			}
			seen[s] = struct{}{}
			out = append(out, s)
		}
		return out
	case []string:
		return normalizeGroupIDs(t)
	case json.Number:
		return []string{t.String()}
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return nil
		}
		var strs []string
		if err := json.Unmarshal(b, &strs); err == nil {
			return normalizeGroupIDs(strs)
		}
		return nil
	}
}

func normalizeGroupIDs(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
