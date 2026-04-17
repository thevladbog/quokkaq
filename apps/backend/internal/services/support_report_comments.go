package services

import (
	"context"
	"strings"
	"time"

	"gorm.io/gorm"
)

// SupportReportCommentItem is one comment in the support report timeline API.
type SupportReportCommentItem struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"`
	Text        string     `json:"text,omitempty"`
	DisplayText string     `json:"displayText"`
	CreatedAt   *time.Time `json:"createdAt,omitempty" swaggertype:"string" format:"date-time"`
	Author      string     `json:"author,omitempty"`
}

func parseYandexTrackerTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	// Tracker often uses +0000 / +0300 without a colon; Go RFC3339 requires +00:00.
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999-0700",
		"2006-01-02T15:04:05.000-0700",
		"2006-01-02T15:04:05-0700",
		"2006-01-02T15:04:05.000000000Z07:00",
		"2006-01-02T15:04:05.000Z07:00",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// ListSupportReportComments returns classified Tracker comments. audience is "staff" (default) or "applicant" (author only).
func (s *SupportReportService) ListSupportReportComments(ctx context.Context, viewerID, reportID, audience string) ([]SupportReportCommentItem, error) {
	audience = strings.TrimSpace(strings.ToLower(audience))
	if audience == "" {
		audience = "staff"
	}
	if audience != "staff" && audience != "applicant" {
		return nil, ErrSupportReportInvalidAudience
	}
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	if audience == "applicant" && row.CreatedByUserID != viewerID {
		return nil, ErrSupportReportForbidden
	}
	okView, err := s.canViewSupportReport(viewerID, row)
	if err != nil {
		return nil, err
	}
	if !okView {
		return nil, ErrSupportReportForbidden
	}
	if err := s.requireYandexComments(row); err != nil {
		return nil, err
	}
	ext := strings.TrimSpace(row.PlaneWorkItemID)
	if ext == "" {
		return []SupportReportCommentItem{}, nil
	}
	yt, ok := s.tracker.(*YandexTrackerClient)
	if !ok || yt == nil || !yt.Enabled() {
		return nil, ErrSupportTicketIntegrationNotConfigured
	}
	rawComments, err := yt.ListComments(ctx, ext)
	if err != nil {
		return nil, err
	}
	out := make([]SupportReportCommentItem, 0, len(rawComments))
	for i := range rawComments {
		c := rawComments[i]
		kind, display := ClassifySupportReportCommentFromTracker(c)
		if audience == "applicant" && kind != supportCommentKindPublic && kind != supportCommentKindEmail {
			continue
		}
		ts := parseYandexTrackerTime(c.CreatedAtRaw)
		var tsPtr *time.Time
		if !ts.IsZero() {
			tsPtr = &ts
		}
		fullText := mergeTrackerCommentBody(c)
		out = append(out, SupportReportCommentItem{
			ID:          strings.TrimSpace(c.ID),
			Kind:        kind,
			Text:        fullText,
			DisplayText: display,
			CreatedAt:   tsPtr,
			Author:      strings.TrimSpace(c.AuthorDisplay),
		})
	}
	return out, nil
}

// PostSupportReportCommentInput is validated input for a new Tracker comment.
type PostSupportReportCommentInput struct {
	Text string
}

// PostSupportReportComment appends a comment on the external Tracker issue (Yandex only).
// Public visibility for the requester is configured in Tracker, not via a QuokkaQ UI flag.
func (s *SupportReportService) PostSupportReportComment(ctx context.Context, viewerID, reportID string, in PostSupportReportCommentInput) error {
	body := strings.TrimSpace(in.Text)
	if body == "" || len(body) > 20000 {
		return ErrSupportReportInvalidDescription
	}
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return err
	}
	okView, err := s.canViewSupportReport(viewerID, row)
	if err != nil {
		return err
	}
	if !okView {
		return ErrSupportReportForbidden
	}
	if err := s.requireYandexComments(row); err != nil {
		return err
	}
	ext := strings.TrimSpace(row.PlaneWorkItemID)
	if ext == "" {
		return gorm.ErrRecordNotFound
	}
	cli := s.clientForBackend(row.TicketBackend)
	if cli == nil || !cli.Enabled() {
		return ErrSupportTicketIntegrationNotConfigured
	}
	return cli.AddComment(ctx, ext, body)
}
