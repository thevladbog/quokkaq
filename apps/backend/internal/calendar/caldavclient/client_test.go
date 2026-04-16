package caldavclient

import (
	"net/url"
	"testing"
)

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
		{name: "path traversal normalizes", href: "/a/../b", wantSub: "/b"},
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
