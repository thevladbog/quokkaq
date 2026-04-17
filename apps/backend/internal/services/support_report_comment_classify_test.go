package services

import (
	"strings"
	"testing"
)

func TestClassifySupportReportCommentFromTracker_publicPrefixes(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"[public] Hello", "Hello"},
		{"  [PUBLIC]  Hi", "Hi"},
		{"\ufeff[public]x", "x"},
		{"[PuBlIc] trailing ", "trailing"},
		{`\[public\] Escaped`, "Escaped"},
	}
	for _, tc := range cases {
		kind, disp := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{Text: tc.raw})
		if kind != supportCommentKindPublic {
			t.Fatalf("%q: kind want public got %q", tc.raw, kind)
		}
		if disp != tc.want {
			t.Fatalf("%q: display want %q got %q", tc.raw, tc.want, disp)
		}
	}
}

func TestClassifySupportReportCommentFromTracker_emailPrefixAndInternal(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{Text: "  [email] Body "})
	if k != supportCommentKindEmail || d != "Body" {
		t.Fatalf("email prefix: got kind=%q disp=%q", k, d)
	}
	k, d = ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{Text: "internal only"})
	if k != supportCommentKindInternal || d != "internal only" {
		t.Fatalf("internal: got kind=%q disp=%q", k, d)
	}
}

func TestClassifySupportReportCommentFromTracker_emailFromTrackerMeta(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		Text:          "plain",
		TransportType: "incoming",
	})
	if k != supportCommentKindEmail || d != "plain" {
		t.Fatalf("incoming: got kind=%q disp=%q", k, d)
	}
	k, d = ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		LongText:    "long body",
		CommentType: "outgoing",
	})
	if k != supportCommentKindEmail || d != "long body" {
		t.Fatalf("outgoing long: got kind=%q disp=%q", k, d)
	}
}

func TestClassifySupportReportCommentFromTracker_emailMetaStripsPublicTag(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		Text:          "[public] visible",
		TransportType: "mail",
	})
	if k != supportCommentKindEmail || d != "visible" {
		t.Fatalf("mail+public: got kind=%q disp=%q", k, d)
	}
}

func TestMergeTrackerCommentBody_prefersTextHtmlForMail(t *testing.T) {
	c := YandexTrackerIssueComment{
		Text:          "",
		LongText:      "",
		TextHTML:      "<p>Hello <b>mail</b></p>",
		CommentType:   "incoming",
		TransportType: "email",
	}
	raw := mergeTrackerCommentBody(c)
	if raw != "Hello mail" {
		t.Fatalf("merge: want %q got %q", "Hello mail", raw)
	}
	k, d := ClassifySupportReportCommentFromTracker(c)
	if k != supportCommentKindEmail || d != "Hello mail" {
		t.Fatalf("classify: kind=%q disp=%q", k, d)
	}
}

func TestClassifySupportReportCommentFromTracker_outcomingTransport(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		Text:          "body",
		TransportType: "outcoming",
	})
	if k != supportCommentKindEmail || d != "body" {
		t.Fatalf("outcoming transport: kind=%q disp=%q", k, d)
	}
}

func TestClassifySupportReportCommentFromTracker_sanitizesNbspEntities(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		Text: "line one &nbsp;\nline two",
	})
	if k != supportCommentKindInternal {
		t.Fatalf("kind want internal got %q", k)
	}
	if d != "line one\nline two" {
		t.Fatalf("display want %q got %q", "line one\nline two", d)
	}
}

func TestClassifySupportReportCommentFromTracker_stripHTMLInsertsBreaksAfterLiTdTh(t *testing.T) {
	k, d := ClassifySupportReportCommentFromTracker(YandexTrackerIssueComment{
		TextHTML: "<ul><li>one</li><li>two</li></ul><table><tr><td>a</td><th>b</th></tr></table>",
	})
	if k != supportCommentKindInternal {
		t.Fatalf("kind want internal got %q", k)
	}
	if !strings.Contains(d, "one") || !strings.Contains(d, "two") || !strings.Contains(d, "a") || !strings.Contains(d, "b") {
		t.Fatalf("expected fragments in display: %q", d)
	}
	if strings.Contains(d, "<") {
		t.Fatalf("expected tags stripped: %q", d)
	}
}
