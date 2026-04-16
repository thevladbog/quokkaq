package caldavclient

import (
	"errors"
	"net/http"
	"net/url"
	"testing"
)

func TestParseETag(t *testing.T) {
	if g := parseETag(`W/"abc"`); g != `W/"abc"` {
		t.Fatalf("weak etag: got %q", g)
	}
	if g := parseETag(`"plain"`); g != "plain" {
		t.Fatalf("strong quoted: got %q", g)
	}
	if g := parseETag(`  `); g != "" {
		t.Fatalf("empty: got %q", g)
	}
}

func TestClient_resolveCalDAVResourceURL(t *testing.T) {
	c, err := NewYandexClient("https://caldav.yandex.ru", "user@yandex.ru", "password")
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name    string
		href    string
		wantErr bool
		wantSub string // substring of resulting URL path (optional)
	}{
		{
			name:    "normal path",
			href:    "/calendars/user/events/foo.ics",
			wantSub: "/calendars/user/events/foo.ics",
		},
		{name: "no leading slash", href: "calendars/x/y.ics", wantSub: "/calendars/x/y.ics"},
		{name: "empty", href: "", wantErr: true},
		{name: "absolute http", href: "http://evil.com/x", wantErr: true},
		{name: "absolute https", href: "https://evil.com/x", wantErr: true},
		{name: "scheme relative", href: "//evil.com/x", wantErr: true},
		// TrimSpace strips trailing newline; embedded CR/LF must still be rejected.
		{name: "embedded newline", href: "/a\n/b", wantErr: true},
		{name: "disallowed space in path", href: "/a b/c", wantErr: true},
		{name: "path traversal rejected after decode", href: "/a/../b", wantErr: true},
		{name: "percent encoded dotdot", href: "/%2e%2e/b", wantErr: true},
		{name: "percent encoded dotdot mixed case", href: "/%2E%2e/x", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u, err := c.resolveCalDAVResourceURL(tt.href)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got URL %v", u)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if u.Scheme != "https" || u.Hostname() != c.base.Hostname() {
				t.Fatalf("bad URL: %s", u.String())
			}
			if tt.wantSub != "" && u.Path != tt.wantSub {
				t.Fatalf("path %q want %q", u.Path, tt.wantSub)
			}
		})
	}
}

func TestClient_resolveCalDAVResourceURL_hostMatchesBase(t *testing.T) {
	base, err := url.Parse("https://caldav.yandex.ru")
	if err != nil {
		t.Fatal(err)
	}
	c := &Client{base: base}
	u, err := c.resolveCalDAVResourceURL("/ok.ics")
	if err != nil {
		t.Fatal(err)
	}
	if u.Hostname() != "caldav.yandex.ru" {
		t.Fatalf("host: %s", u.Hostname())
	}
}

func TestCaldavURLsSameOrigin_portNormalization(t *testing.T) {
	a, err := url.Parse("https://caldav.yandex.ru/path/x")
	if err != nil {
		t.Fatal(err)
	}
	b, err := url.Parse("https://caldav.yandex.ru:443/other")
	if err != nil {
		t.Fatal(err)
	}
	if err := caldavURLsSameOrigin(a, b); err != nil {
		t.Fatal(err)
	}
}

func TestCaldavBoundRoundTripper_rejectsForeignHost(t *testing.T) {
	base, err := url.Parse("https://caldav.yandex.ru")
	if err != nil {
		t.Fatal(err)
	}
	rt := &caldavBoundRoundTripper{
		base: base,
		next: roundTripperFunc(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("next must not be called")
		}),
	}
	evil, err := url.Parse("https://evil.com/foo")
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodGet, evil.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rt.RoundTrip(req); err == nil {
		t.Fatal("expected error for foreign host")
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}
