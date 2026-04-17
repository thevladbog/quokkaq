package tenantslug

import (
	"fmt"
	"regexp"
	"strings"
)

var slugPart = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Reserved slugs must not be used as tenant identifiers (routing, infra).
// TypeScript mirror: packages/shared-types/src/tenant-slug.ts — keep lists and Normalize in sync.
var reserved = map[string]struct{}{
	"www": {}, "api": {}, "admin": {}, "login": {}, "auth": {}, "static": {},
	"health": {}, "swagger": {}, "docs": {}, "ws": {}, "system": {},
	"en": {}, "ru": {}, "t": {},
}

// IsReserved reports whether s is reserved (after normalization).
func IsReserved(s string) bool {
	_, ok := reserved[strings.ToLower(strings.TrimSpace(s))]
	return ok
}

// Normalize converts input to a lowercase slug candidate (may be empty or invalid length).
func Normalize(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ', r == '-', r == '_':
			if b.Len() > 0 && !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		default:
			// skip
		}
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return out
}

const (
	MinLen = 3
	MaxLen = 63
)

// Validate returns an error if s is not an acceptable tenant slug.
func Validate(s string) error {
	if len(s) < MinLen || len(s) > MaxLen {
		return fmt.Errorf("slug length must be between %d and %d", MinLen, MaxLen)
	}
	if !slugPart.MatchString(s) {
		return fmt.Errorf("invalid slug format")
	}
	if IsReserved(s) {
		return fmt.Errorf("slug is reserved")
	}
	return nil
}
