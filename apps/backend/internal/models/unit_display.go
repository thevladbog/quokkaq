package models

import "strings"

// UnitDisplayName returns the unit label for UI. When locale starts with "en" and nameEn is set, it is used; otherwise name.
func UnitDisplayName(u *Unit, locale string) string {
	if u == nil {
		return ""
	}
	loc := strings.ToLower(strings.TrimSpace(locale))
	if strings.HasPrefix(loc, "en") && u.NameEn != nil {
		if t := strings.TrimSpace(*u.NameEn); t != "" {
			return t
		}
	}
	return strings.TrimSpace(u.Name)
}
