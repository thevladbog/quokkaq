package middleware

import (
	"context"
	"net/http"
	"strconv"
	"strings"
)

type localeCtxKey struct{}

var localeContextKey = localeCtxKey{}

// LocaleMiddleware stores a normalized locale ("en" or "ru") in request context from Accept-Language.
func LocaleMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		loc := LocaleFromAcceptLanguage(r.Header.Get("Accept-Language"))
		ctx := context.WithValue(r.Context(), localeContextKey, loc)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// LocaleFromAcceptLanguage returns "ru" or "en" (default), matching the frontend contract.
// It parses all comma-separated language ranges, honors q values (default q=1), and picks
// the supported locale ("en" or "ru") with the highest q; on equal q, the earlier range wins.
func LocaleFromAcceptLanguage(accept string) string {
	accept = strings.TrimSpace(accept)
	if accept == "" {
		return "en"
	}
	bestQ := -1.0
	bestLocale := "en"
	for _, part := range strings.Split(accept, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		semis := strings.Split(part, ";")
		langRange := strings.TrimSpace(semis[0])
		if langRange == "" || langRange == "*" {
			continue
		}
		q := parseAcceptLanguageQ(semis[1:])
		if q <= 0 {
			continue
		}
		primary := normalizeAcceptLanguagePrimary(langRange)
		if primary != "en" && primary != "ru" {
			continue
		}
		if q > bestQ {
			bestQ = q
			bestLocale = primary
		}
	}
	if bestQ < 0 {
		return "en"
	}
	return bestLocale
}

func normalizeAcceptLanguagePrimary(langRange string) string {
	tag := strings.ToLower(strings.TrimSpace(langRange))
	if dash := strings.Index(tag, "-"); dash >= 0 {
		tag = tag[:dash]
	}
	return tag
}

// parseAcceptLanguageQ returns the q value for the range, default 1.0 when absent.
// Malformed, non-numeric, or out-of-range (not in [0,1]) q values return 0 so the range is ignored.
func parseAcceptLanguageQ(params []string) float64 {
	for _, p := range params {
		p = strings.TrimSpace(p)
		eq := strings.Index(p, "=")
		if eq < 0 {
			continue
		}
		name := strings.TrimSpace(strings.ToLower(p[:eq]))
		if name != "q" {
			continue
		}
		vStr := strings.TrimSpace(p[eq+1:])
		if vStr == "" {
			return 0
		}
		v, err := strconv.ParseFloat(vStr, 64)
		if err != nil || v < 0 || v > 1 {
			return 0
		}
		return v
	}
	return 1.0
}

// GetLocale returns context locale or "en".
func GetLocale(ctx context.Context) string {
	if v, ok := ctx.Value(localeContextKey).(string); ok && v != "" {
		return v
	}
	return "en"
}
