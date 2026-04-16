// Package caldavclient wraps emersion/go-webdav CalDAV for Yandex and similar servers.
package caldavclient

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
)

// Client is a thin wrapper with Yandex-friendly helpers.
type Client struct {
	caldav *caldav.Client
	base   *url.URL
	user   string
	pass   string
}

// NewYandexClient creates a CalDAV client for caldav.yandex.ru with app password.
func NewYandexClient(username, appPassword string) (*Client, error) {
	baseURL := "https://caldav.yandex.ru"
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	hc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, username, appPassword)
	cl, err := caldav.NewClient(hc, baseURL)
	if err != nil {
		return nil, err
	}
	return &Client{caldav: cl, base: u, user: username, pass: appPassword}, nil
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

// GetEvent fetches a single calendar object by href path.
func (c *Client) GetEvent(ctx context.Context, hrefPath string) (*caldav.CalendarObject, error) {
	return c.caldav.GetCalendarObject(ctx, hrefPath)
}

// PutCalendar replaces the entire calendar resource (PUT). If etag is non-empty, sends If-Match.
func (c *Client) PutCalendar(ctx context.Context, hrefPath, etag string, cal *ical.Calendar) error {
	var buf bytes.Buffer
	if err := ical.NewEncoder(&buf).Encode(cal); err != nil {
		return err
	}
	base := strings.TrimRight(c.base.String(), "/")
	path := hrefPath
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	fullURL := base + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, fullURL, &buf)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Content-Type", ical.MIMEType)
	if etag != "" {
		req.Header.Set("If-Match", etag)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusPreconditionFailed {
		return ErrPreconditionFailed
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("caldav: PUT %s: %s", hrefPath, resp.Status)
	}
	return nil
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
