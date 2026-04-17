package models

import "testing"

func TestGoogleCalDAVEventsCollectionPath(t *testing.T) {
	t.Parallel()
	t.Run("email", func(t *testing.T) {
		t.Parallel()
		got, err := GoogleCalDAVEventsCollectionPath("user@gmail.com")
		if err != nil {
			t.Fatal(err)
		}
		// Go url.PathEscape keeps @ unescaped in path segments (valid per RFC 3986).
		if got != "/caldav/v2/user@gmail.com/events" {
			t.Fatalf("got %q", got)
		}
	})
	t.Run("spaces_in_id", func(t *testing.T) {
		t.Parallel()
		gotSp, err := GoogleCalDAVEventsCollectionPath("cal id/here")
		if err != nil {
			t.Fatal(err)
		}
		if gotSp != "/caldav/v2/cal%20id%2Fhere/events" {
			t.Fatalf("escaped path: %q", gotSp)
		}
	})
	t.Run("trimming_equivalent", func(t *testing.T) {
		t.Parallel()
		a, errA := GoogleCalDAVEventsCollectionPath("  cal id  ")
		b, errB := GoogleCalDAVEventsCollectionPath("cal id")
		if errA != nil || errB != nil {
			t.Fatalf("err a=%v b=%v", errA, errB)
		}
		if a != b {
			t.Fatalf("trim mismatch: %q vs %q", a, b)
		}
	})
	t.Run("empty", func(t *testing.T) {
		t.Parallel()
		_, err := GoogleCalDAVEventsCollectionPath("")
		if err == nil {
			t.Fatal("expected error")
		}
	})
	t.Run("whitespace_only", func(t *testing.T) {
		t.Parallel()
		_, err := GoogleCalDAVEventsCollectionPath("   \t  ")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}
