package models

import "testing"

func TestGoogleCalDAVEventsCollectionPath(t *testing.T) {
	t.Parallel()
	got := GoogleCalDAVEventsCollectionPath("user@gmail.com")
	// Go url.PathEscape keeps @ unescaped in path segments (valid per RFC 3986).
	if got != "/caldav/v2/user@gmail.com/events" {
		t.Fatalf("got %q", got)
	}
	gotSp := GoogleCalDAVEventsCollectionPath("cal id/here")
	if gotSp != "/caldav/v2/cal%20id%2Fhere/events" {
		t.Fatalf("escaped path: %q", gotSp)
	}
}
