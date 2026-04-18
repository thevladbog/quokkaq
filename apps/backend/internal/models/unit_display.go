package models

import "strings"

// UnitDisplayName returns the unit label for UI. For locales en, en-*, or en_*, when nameEn is set and non-empty after trim, it is used; otherwise name.
func UnitDisplayName(u *Unit, locale string) string {
	if u == nil {
		return ""
	}
	loc := strings.ToLower(strings.TrimSpace(locale))
	useEnName := loc == "en" || strings.HasPrefix(loc, "en-") || strings.HasPrefix(loc, "en_")
	if useEnName && u.NameEn != nil {
		if t := strings.TrimSpace(*u.NameEn); t != "" {
			return t
		}
	}
	return strings.TrimSpace(u.Name)
}
