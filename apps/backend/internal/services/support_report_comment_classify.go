package services

import (
	"html"
	"regexp"
	"strings"
)

const (
	supportCommentKindInternal = "internal"
	supportCommentKindPublic   = "public"
	supportCommentKindEmail    = "email"
)

var (
	// Optional backslashes before brackets (e.g. Markdown-escaped \[public\] in Tracker text).
	reSupportCommentPublicPrefix = regexp.MustCompile(`(?i)^\s*\x{FEFF}?\s*\\*\[\\*public\\*\]\s*`)
	reSupportCommentEmailPrefix  = regexp.MustCompile(`(?i)^\s*\x{FEFF}?\s*\\*\[\\*email\\*\]\s*`)
	reStripHTMLScript            = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStripHTMLStyle             = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reStripHTMLBr                = regexp.MustCompile(`(?i)<br\s*/?>`)
	reStripHTMLBlockClose        = regexp.MustCompile(`(?i)</(p|div|tr|h[1-6])\s*>`)
	reStripHTMLTags              = regexp.MustCompile(`<[^>]+>`)
	reStripHTMLSpaceBeforeNL     = regexp.MustCompile(`[ \t\f\v]+\n`)
	reStripHTMLMultiNL           = regexp.MustCompile(`\n{3,}`)
	reDisplayMultiSpace          = regexp.MustCompile(`[ \t]{2,}`)
	reDisplaySpaceBeforeNL       = regexp.MustCompile(`[ \t]+\n`)
	reDisplaySpaceAfterNL        = regexp.MustCompile(`\n[ \t]+`)
)

func stripHTMLToPlain(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = reStripHTMLScript.ReplaceAllString(s, "")
	s = reStripHTMLStyle.ReplaceAllString(s, "")
	s = reStripHTMLBr.ReplaceAllString(s, "\n")
	s = reStripHTMLBlockClose.ReplaceAllString(s, "\n")
	s = reStripHTMLTags.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = strings.TrimSpace(reStripHTMLSpaceBeforeNL.ReplaceAllString(s, "\n"))
	s = strings.TrimSpace(reStripHTMLMultiNL.ReplaceAllString(s, "\n\n"))
	return strings.TrimSpace(s)
}

func mergeTrackerCommentBody(c YandexTrackerIssueComment) string {
	if t := strings.TrimSpace(c.Text); t != "" {
		return t
	}
	if t := strings.TrimSpace(c.LongText); t != "" {
		return t
	}
	if t := stripHTMLToPlain(c.TextHTML); t != "" {
		return t
	}
	return ""
}

func isTrackerMailComment(c YandexTrackerIssueComment) bool {
	tt := strings.ToLower(strings.TrimSpace(c.TransportType))
	if tt == "email" || tt == "incoming" || tt == "outgoing" || tt == "outcoming" || tt == "mail" {
		return true
	}
	ct := strings.ToLower(strings.TrimSpace(c.CommentType))
	if ct == "incoming" || ct == "outgoing" || ct == "outcoming" || ct == "email" {
		return true
	}
	return false
}

func stripTaggedPrefixes(s string) string {
	s = strings.TrimSpace(reSupportCommentPublicPrefix.ReplaceAllString(s, ""))
	s = strings.TrimSpace(reSupportCommentEmailPrefix.ReplaceAllString(s, ""))
	return s
}

// sanitizeSupportCommentDisplay normalizes entities and whitespace for UI/API display.
func sanitizeSupportCommentDisplay(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\u2007", " ")
	s = strings.ReplaceAll(s, "\u202f", " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.TrimSpace(reDisplayMultiSpace.ReplaceAllString(s, " "))
	s = strings.TrimSpace(reDisplaySpaceBeforeNL.ReplaceAllString(s, "\n"))
	s = strings.TrimSpace(reDisplaySpaceAfterNL.ReplaceAllString(s, "\n"))
	return strings.TrimSpace(s)
}

// ClassifySupportReportCommentFromTracker returns kind (internal|public|email) and displayText (prefix markers stripped when used only for classification).
func ClassifySupportReportCommentFromTracker(c YandexTrackerIssueComment) (kind, displayText string) {
	raw := mergeTrackerCommentBody(c)
	if isTrackerMailComment(c) {
		kind, displayText = supportCommentKindEmail, stripTaggedPrefixes(raw)
	} else if reSupportCommentPublicPrefix.MatchString(raw) {
		kind, displayText = supportCommentKindPublic, strings.TrimSpace(reSupportCommentPublicPrefix.ReplaceAllString(raw, ""))
	} else if reSupportCommentEmailPrefix.MatchString(raw) {
		kind, displayText = supportCommentKindEmail, strings.TrimSpace(reSupportCommentEmailPrefix.ReplaceAllString(raw, ""))
	} else {
		kind, displayText = supportCommentKindInternal, raw
	}
	displayText = sanitizeSupportCommentDisplay(displayText)
	return kind, displayText
}
