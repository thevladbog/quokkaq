package middleware

import (
	"context"
	"net/http"
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
func LocaleFromAcceptLanguage(accept string) string {
	accept = strings.TrimSpace(accept)
	if accept == "" {
		return "en"
	}
	parts := strings.Split(accept, ",")
	tag := strings.TrimSpace(parts[0])
	if tag == "" {
		return "en"
	}
	if semi := strings.Index(tag, ";"); semi >= 0 {
		tag = strings.TrimSpace(tag[:semi])
	}
	tag = strings.ToLower(tag)
	if dash := strings.Index(tag, "-"); dash >= 0 {
		tag = tag[:dash]
	}
	if tag == "ru" {
		return "ru"
	}
	return "en"
}

// GetLocale returns context locale or "en".
func GetLocale(ctx context.Context) string {
	if v, ok := ctx.Value(localeContextKey).(string); ok && v != "" {
		return v
	}
	return "en"
}
