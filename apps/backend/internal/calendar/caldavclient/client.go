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
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
)

// Client is a thin wrapper with Yandex-friendly helpers.
type Client struct {
	caldav     *caldav.Client
	httpClient *http.Client
	base       *url.URL
	user       string
	pass       string
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
	return &Client{caldav: cl, httpClient: httpClient, base: baseNorm, user: username, pass: appPassword}, nil
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
	req.SetBasicAuth(c.user, c.pass)
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
		uq, err := strconv.Unquote(etag)
		if err != nil {
			return nil, err
		}
		co.ETag = uq
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
	p = path.Clean(p)
	if !strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return nil, fmt.Errorf("caldav: invalid path")
	}
	baseStr := strings.TrimRight(c.base.String(), "/")
	fullURL := baseStr + p
	u, err := url.Parse(fullURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "https" {
		return nil, fmt.Errorf("caldav: only https is allowed")
	}
	wantHost := strings.ToLower(strings.TrimSpace(c.base.Hostname()))
	if strings.ToLower(u.Hostname()) != wantHost {
		return nil, fmt.Errorf("caldav: unexpected host %q", u.Hostname())
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
	req.SetBasicAuth(c.user, c.pass)
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
	if uq, uerr := strconv.Unquote(raw); uerr == nil {
		return uq, nil
	}
	return strings.Trim(raw, `"`), nil
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
