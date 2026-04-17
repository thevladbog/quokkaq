package services

import (
	"context"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func listWritableGoogleCalendarsFromRefresh(ctx context.Context, refreshToken string) ([]GoogleCalendarPickOption, error) {
	cfg := googleCalendarOAuthConfig()
	if cfg == nil {
		return nil, ErrGoogleCalendarOAuthNotConfigured
	}
	rt := strings.TrimSpace(refreshToken)
	if rt == "" {
		return nil, ErrGoogleCalendarOAuthNoRefreshToken
	}
	ts := cfg.TokenSource(ctx, &oauth2.Token{RefreshToken: rt})
	hc := &http.Client{Timeout: 30 * time.Second}
	svc, err := calendar.NewService(ctx, option.WithTokenSource(ts), option.WithHTTPClient(hc))
	if err != nil {
		return nil, err
	}
	var out []GoogleCalendarPickOption
	err = svc.CalendarList.List().MaxResults(250).ShowDeleted(false).ShowHidden(false).Pages(ctx, func(list *calendar.CalendarList) error {
		for _, item := range list.Items {
			if item == nil {
				continue
			}
			if item.AccessRole != "owner" && item.AccessRole != "writer" {
				continue
			}
			sum := strings.TrimSpace(item.Summary)
			if sum == "" {
				sum = item.Id
			}
			out = append(out, GoogleCalendarPickOption{
				ID:      item.Id,
				Summary: sum,
				Primary: item.Primary,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
