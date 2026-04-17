// Package caldavclient wraps emersion/go-webdav CalDAV for Yandex and similar servers.
package caldavclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
	"golang.org/x/oauth2"

	"quokkaq-go-backend/internal/models"
)

// caldavSafeResourcePath matches normalized CalDAV resource paths (RFC 3986 "pchar"
// subset) so hrefs cannot inject schemes, hosts, or CRLF into constructed URLs.
// CodeQL's go/request-forgery query treats regexp.MatchString on the path as a barrier guard.
var caldavSafeResourcePath = regexp.MustCompile(
	`^/[A-Za-z0-9/._~%!$&'()*+,;=:@-]*$`,
)

// parseETag normalizes CalDAV ETag headers for storage and If-Match round-trips.
// Weak validators (RFC 9110) use the form W/"value"; strconv.Unquote rejects those.
func parseETag(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if len(s) >= 2 && (s[0] == 'W' || s[0] == 'w') && s[1] == '/' {
		return s
	}
	if uq, err := strconv.Unquote(s); err == nil {
		return uq
	}
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

// Client is a thin wrapper with Yandex-friendly helpers.
type Client struct {
	caldav       *caldav.Client
	httpClient   *http.Client
	base         *url.URL
	user         string
	pass         string
	useBasicAuth bool // false: rely on oauth2 transport (Google Bearer)
}

// NewYandexClient creates a CalDAV client against baseURL (typically https://caldav.yandex.ru) with app password.
func NewYandexClient(baseURL, username, appPassword string) (*Client, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = "https://caldav.yandex.ru"
	}
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "https" {
		return nil, fmt.Errorf("caldav: base URL must use https")
	}
	if strings.TrimSpace(u.Hostname()) == "" {
		return nil, fmt.Errorf("caldav: base URL must include a host")
	}
	endpoint := strings.TrimRight(u.String(), "/")
	httpClient := &http.Client{Timeout: 30 * time.Second}
	hc := webdav.HTTPClientWithBasicAuth(httpClient, username, appPassword)
	cl, err := caldav.NewClient(hc, endpoint)
	if err != nil {
		return nil, err
	}
	baseNorm, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	next := httpClient.Transport
	if next == nil {
		next = http.DefaultTransport
	}
	httpClient.Transport = &caldavBoundRoundTripper{base: baseNorm, next: next}
	return &Client{
		caldav:       cl,
		httpClient:   httpClient,
		base:         baseNorm,
		user:         username,
		pass:         appPassword,
		useBasicAuth: true,
	}, nil
}

// NewGoogleCalDAVClient builds a CalDAV client for Google Calendar (OAuth2 bearer on apidata.googleusercontent.com).
func NewGoogleCalDAVClient(ctx context.Context, ts oauth2.TokenSource) (*Client, error) {
	if ts == nil {
		return nil, fmt.Errorf("caldav: token source required for Google")
	}
	endpoint := strings.TrimRight(models.GoogleCalDAVBaseURL, "/")
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(u.Scheme, "https") || strings.TrimSpace(u.Hostname()) == "" {
		return nil, fmt.Errorf("caldav: invalid Google CalDAV base URL")
	}
	baseNorm := u
	httpClient := oauth2.NewClient(ctx, ts)
	httpClient.Timeout = 30 * time.Second
	next := httpClient.Transport
	if next == nil {
		next = http.DefaultTransport
	}
	httpClient.Transport = &caldavBoundRoundTripper{base: baseNorm, next: next}
	cl, err := caldav.NewClient(httpClient, endpoint)
	if err != nil {
		return nil, err
	}
	return &Client{
		caldav:       cl,
		httpClient:   httpClient,
		base:         baseNorm,
		useBasicAuth: false,
	}, nil
}

// caldavBoundRoundTripper rejects outbound requests whose URL is not the same
// HTTPS origin as the configured CalDAV base. This blocks SSRF / request-forgery
// if a caller ever passes a crafted URL to the shared http.Client (defense in depth
// alongside resolveCalDAVResourceURL).
type caldavBoundRoundTripper struct {
	base *url.URL
	next http.RoundTripper
}

func (t *caldavBoundRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if req == nil || req.URL == nil {
		return nil, fmt.Errorf("caldav: invalid request")
	}
	if err := caldavURLsSameOrigin(req.URL, t.base); err != nil {
		return nil, err
	}
	return t.next.RoundTrip(req)
}

func caldavHTTPSHostPort(u *url.URL) (host, port string, err error) {
	if u == nil {
		return "", "", fmt.Errorf("caldav: nil URL")
	}
	if !strings.EqualFold(u.Scheme, "https") {
		return "", "", fmt.Errorf("caldav: only https is allowed")
	}
	host = strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return "", "", fmt.Errorf("caldav: missing host")
	}
	port = u.Port()
	if port == "" {
		port = "443"
	}
	return host, port, nil
}

// caldavURLsSameOrigin returns nil when a and b denote the same https host:port.
func caldavURLsSameOrigin(a, b *url.URL) error {
	ah, ap, err := caldavHTTPSHostPort(a)
	if err != nil {
		return err
	}
	bh, bp, err := caldavHTTPSHostPort(b)
	if err != nil {
		return err
	}
	if ah != bh || ap != bp {
		return fmt.Errorf("caldav: URL origin does not match configured base (got %s:%s, want %s:%s)", ah, ap, bh, bp)
	}
	return nil
}

// PrincipalPath returns the standard Yandex principal URL path.
func PrincipalPath(username string) string {
	// user@domain -> path uses URL-encoded @
	escaped := url.PathEscape(username)
	return "/principals/users/" + escaped + "/"
}

// DefaultCalendarHome discovers calendar home and returns the first calendar path, or error.
func (c *Client) DefaultCalendarHome(ctx context.Context, username string) (calendarPath string, err error) {
	home, err := c.caldav.FindCalendarHomeSet(ctx, PrincipalPath(username))
	if err != nil {
		return "", err
	}
	cals, err := c.caldav.FindCalendars(ctx, home)
	if err != nil {
		return "", err
	}
	if len(cals) == 0 {
		return "", fmt.Errorf("caldav: no calendars under home %s", home)
	}
	return cals[0].Path, nil
}

// QueryVEvents runs a calendar-query REPORT for VEVENT in [start,end).
func (c *Client) QueryVEvents(ctx context.Context, calendarPath string, start, end time.Time) ([]caldav.CalendarObject, error) {
	q := caldav.CalendarQuery{
		CompRequest: caldav.CalendarCompRequest{
			Name: "VCALENDAR",
			Comps: []caldav.CalendarCompRequest{
				{Name: "VEVENT", Props: []string{"SUMMARY", "DESCRIPTION", "UID", "DTSTART", "DTEND", "RRULE"}},
			},
		},
		CompFilter: caldav.CompFilter{
			Name:  "VEVENT",
			Start: start,
			End:   end,
		},
	}
	return c.caldav.QueryCalendar(ctx, calendarPath, &q)
}

// ErrNotFound is returned when the CalDAV resource responds with HTTP 404.
var ErrNotFound = errors.New("caldav: calendar object not found")

// GetEvent fetches a single calendar object by href path.
func (c *Client) GetEvent(ctx context.Context, hrefPath string) (*caldav.CalendarObject, error) {
	target, err := c.resolveCalDAVResourceURL(hrefPath)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, err
	}
	if c.useBasicAuth {
		req.SetBasicAuth(c.user, c.pass)
	}
	req.Header.Set("Accept", ical.MIMEType)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("caldav: GET %s: %s", hrefPath, resp.Status)
	}
	mediaType, _, err := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(mediaType, ical.MIMEType) {
		return nil, fmt.Errorf("caldav: expected Content-Type %q, got %q", ical.MIMEType, mediaType)
	}
	cal, err := ical.NewDecoder(resp.Body).Decode()
	if err != nil {
		return nil, err
	}
	co := &caldav.CalendarObject{
		Path: resp.Request.URL.Path,
		Data: cal,
	}
	if etag := resp.Header.Get("ETag"); etag != "" {
		co.ETag = parseETag(etag)
	}
	return co, nil
}

// resolveCalDAVResourceURL builds the HTTPS URL for a CalDAV resource path and rejects values
// that could turn the request into SSRF or a non-CalDAV target (absolute URLs, traversal, etc.).
func (c *Client) resolveCalDAVResourceURL(hrefPath string) (*url.URL, error) {
	hrefPath = strings.TrimSpace(hrefPath)
	if hrefPath == "" {
		return nil, fmt.Errorf("caldav: empty href")
	}
	if strings.ContainsAny(hrefPath, "\r\n") {
		return nil, fmt.Errorf("caldav: invalid href")
	}
	// Block absolute and scheme-relative URLs so user data cannot redirect the request off-site.
	if strings.Contains(hrefPath, "://") || strings.HasPrefix(hrefPath, "//") {
		return nil, fmt.Errorf("caldav: href must be a path, not a full URL")
	}
	p := hrefPath
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	decoded := p
	for i := 0; i < 8; i++ {
		unescaped, err := url.PathUnescape(decoded)
		if err != nil {
			return nil, fmt.Errorf("caldav: invalid path")
		}
		if unescaped == decoded {
			break
		}
		decoded = unescaped
	}
	if strings.Contains(decoded, "..") {
		return nil, fmt.Errorf("caldav: invalid path")
	}
	p = path.Clean(decoded)
	if !strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return nil, fmt.Errorf("caldav: invalid path")
	}
	if !caldavSafeResourcePath.MatchString(p) {
		return nil, fmt.Errorf("caldav: disallowed path characters")
	}
	baseStr := strings.TrimRight(c.base.String(), "/")
	fullURL := baseStr + p
	u, err := url.Parse(fullURL)
	if err != nil {
		return nil, err
	}
	if err := caldavURLsSameOrigin(u, c.base); err != nil {
		return nil, err
	}
	return u, nil
}

// PutCalendar replaces the entire calendar resource (PUT). If etag is non-empty, sends If-Match.
// On success, returns the new entity tag from the response ETag header when the server sends one.
func (c *Client) PutCalendar(ctx context.Context, hrefPath, etag string, cal *ical.Calendar) (newETag string, err error) {
	var buf bytes.Buffer
	if err := ical.NewEncoder(&buf).Encode(cal); err != nil {
		return "", err
	}
	target, err := c.resolveCalDAVResourceURL(hrefPath)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, target.String(), &buf)
	if err != nil {
		return "", err
	}
	if c.useBasicAuth {
		req.SetBasicAuth(c.user, c.pass)
	}
	req.Header.Set("Content-Type", ical.MIMEType)
	if etag != "" {
		req.Header.Set("If-Match", etag)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	if resp.StatusCode == http.StatusPreconditionFailed {
		return "", ErrPreconditionFailed
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("caldav: PUT %s: %s", hrefPath, resp.Status)
	}
	raw := resp.Header.Get("ETag")
	if raw == "" {
		return "", nil
	}
	return parseETag(raw), nil
}

// ErrPreconditionFailed is returned when If-Match ETag does not match (slot taken).
var ErrPreconditionFailed = fmt.Errorf("caldav: precondition failed (etag mismatch)")

// FirstVEvent returns the first VEVENT component from a calendar object, if any.
func FirstVEvent(co *caldav.CalendarObject) *ical.Component {
	if co == nil || co.Data == nil {
		return nil
	}
	for _, child := range co.Data.Children {
		if child.Name == ical.CompEvent {
			return child
		}
	}
	return nil
}
