package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"quokkaq-go-backend/internal/calendar/summary"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/ssocrypto"

	"golang.org/x/oauth2"
)

func (s *CalendarIntegrationService) syncMicrosoftGraphCalendar(ctx context.Context, integ *models.UnitCalendarIntegration) error {
	cfg := microsoftOAuth2Config()
	if cfg == nil {
		_ = s.markSyncError(integ.ID, "microsoft oauth not configured")
		return fmt.Errorf("microsoft oauth not configured")
	}
	rawRT, err := ssocrypto.DecryptAES256GCM(integ.CredentialCiphertext)
	if err != nil {
		_ = s.markSyncError(integ.ID, err.Error())
		return err
	}
	ts := cfg.TokenSource(ctx, &oauth2.Token{RefreshToken: string(rawRT)})
	tok, err := ts.Token()
	if err != nil {
		_ = s.markSyncError(integ.ID, err.Error())
		return err
	}
	access := strings.TrimSpace(tok.AccessToken)
	if access == "" {
		_ = s.markSyncError(integ.ID, "empty access token")
		return fmt.Errorf("empty access token")
	}

	unitID := integ.UnitID
	loc, err := time.LoadLocation(integ.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	start := now.AddDate(0, 0, -1).UTC().Format(time.RFC3339)
	end := now.AddDate(0, 0, 90).UTC().Format(time.RFC3339)
	calPath := strings.TrimSpace(integ.CalendarPath)
	if calPath == "" {
		calPath = "primary"
	}
	q := url.Values{}
	q.Set("startDateTime", start)
	q.Set("endDateTime", end)
	var firstURL string
	if strings.EqualFold(calPath, "primary") {
		firstURL = "https://graph.microsoft.com/v1.0/me/calendar/calendarView?" + q.Encode()
	} else {
		firstURL = fmt.Sprintf("https://graph.microsoft.com/v1.0/me/calendars/%s/calendarView?%s", url.PathEscape(calPath), q.Encode())
	}

	events, err := s.fetchAllMicrosoftGraphCalendarViewPages(ctx, integ.ID, firstURL, access)
	if err != nil {
		return err
	}

	svcRows, err := s.serviceRepo.FindAllByUnitSubtree(unitID)
	if err != nil {
		return err
	}
	labelToServiceID := map[string]string{}
	for i := range svcRows {
		svc := &svcRows[i]
		if !svc.Prebook {
			continue
		}
		lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
		lbl = strings.TrimSpace(lbl)
		if lbl != "" {
			labelToServiceID[strings.ToLower(lbl)] = svc.ID
		}
	}

	syncStart := time.Now().UTC()
	seen := make(map[string]struct{})
	for _, ev := range events {
		if isCancelledMS(ev) {
			continue
		}
		id, _ := ev["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		subj, _ := ev["subject"].(string)
		p := summary.Parse(subj)
		startUTC, endUTC, ok := microsoftEventTimes(ev)
		if !ok {
			continue
		}
		icalUID, _ := ev["iCalUId"].(string)
		if strings.TrimSpace(icalUID) == "" {
			icalUID = id
		}
		svcID, ok := labelToServiceID[strings.ToLower(strings.TrimSpace(p.ServiceLabel))]
		var svcPtr *string
		if ok {
			svcIDCopy := svcID
			svcPtr = &svcIDCopy
		}
		href := "graph:" + id
		row := models.CalendarExternalSlot{
			UnitID:        unitID,
			IntegrationID: integ.ID,
			Href:          href,
			ICalUID:       strings.TrimSpace(icalUID),
			ETag:          "",
			StartUTC:      startUTC.UTC(),
			EndUTC:        endUTC.UTC(),
			Summary:       subj,
			ParsedState:   p.State,
			ServiceID:     svcPtr,
		}
		if err := s.repo.UpsertExternalSlot(&row); err != nil {
			_ = s.markSyncError(integ.ID, err.Error())
			return err
		}
		seen[href] = struct{}{}
	}

	if err := s.repo.DeleteSlotsNotSeenSince(integ.ID, syncStart); err != nil {
		return err
	}
	_ = s.repo.UpdateSyncMeta(integ.ID, time.Now().UTC(), "")
	return nil
}

const maxMicrosoftGraphCalendarViewPages = 200

// fetchAllMicrosoftGraphCalendarViewPages follows @odata.nextLink until all pages are collected.
func (s *CalendarIntegrationService) fetchAllMicrosoftGraphCalendarViewPages(ctx context.Context, integID, startURL, access string) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	next := strings.TrimSpace(startURL)
	seenLinks := make(map[string]struct{})
	for page := 0; next != ""; page++ {
		if page >= maxMicrosoftGraphCalendarViewPages {
			msg := fmt.Sprintf("graph calendarView: exceeded max page limit (%d)", maxMicrosoftGraphCalendarViewPages)
			_ = s.markSyncError(integID, msg)
			return nil, fmt.Errorf("%s", msg)
		}
		if _, dup := seenLinks[next]; dup {
			msg := "graph calendarView: duplicate @odata.nextLink (pagination loop)"
			_ = s.markSyncError(integID, msg)
			return nil, fmt.Errorf("%s", msg)
		}
		seenLinks[next] = struct{}{}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, next, nil)
		if err != nil {
			_ = s.markSyncError(integID, err.Error())
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+access)
		resp, err := microsoftOAuthHTTPClient.Do(req)
		if err != nil {
			_ = s.markSyncError(integID, err.Error())
			return nil, err
		}
		body, readErr := readMicrosoftGraphResponseBody(resp)
		if readErr != nil {
			_ = s.markSyncError(integID, readErr.Error())
			return nil, readErr
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			msg := fmt.Sprintf("graph calendarView: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
			_ = s.markSyncError(integID, msg)
			return nil, fmt.Errorf("%s", msg)
		}
		var envelope struct {
			Value    []map[string]interface{} `json:"value"`
			NextLink string                   `json:"@odata.nextLink"`
		}
		if err := json.Unmarshal(body, &envelope); err != nil {
			_ = s.markSyncError(integID, err.Error())
			return nil, err
		}
		all = append(all, envelope.Value...)
		next = strings.TrimSpace(envelope.NextLink)
	}
	return all, nil
}

func isCancelledMS(ev map[string]interface{}) bool {
	if s, ok := ev["isCancelled"].(bool); ok && s {
		return true
	}
	if st, ok := ev["showAs"].(string); ok && strings.EqualFold(st, "cancelled") {
		return true
	}
	return false
}

func microsoftEventTimes(ev map[string]interface{}) (startUTC, endUTC time.Time, ok bool) {
	startObj, ok1 := ev["start"].(map[string]interface{})
	endObj, ok2 := ev["end"].(map[string]interface{})
	if !ok1 || !ok2 {
		return time.Time{}, time.Time{}, false
	}
	sdt, _ := startObj["dateTime"].(string)
	sz, _ := startObj["timeZone"].(string)
	edt, _ := endObj["dateTime"].(string)
	ez, _ := endObj["timeZone"].(string)
	if strings.TrimSpace(sdt) == "" || strings.TrimSpace(edt) == "" {
		return time.Time{}, time.Time{}, false
	}
	locS := time.UTC
	if strings.TrimSpace(sz) != "" {
		if l, err := time.LoadLocation(sz); err == nil {
			locS = l
		}
	}
	locE := time.UTC
	if strings.TrimSpace(ez) != "" {
		if l, err := time.LoadLocation(ez); err == nil {
			locE = l
		}
	}
	t1, err1 := time.ParseInLocation("2006-01-02T15:04:05", strings.Split(sdt, ".")[0], locS)
	if err1 != nil {
		t1, err1 = time.Parse(time.RFC3339, sdt)
		if err1 != nil {
			return time.Time{}, time.Time{}, false
		}
	}
	t2, err2 := time.ParseInLocation("2006-01-02T15:04:05", strings.Split(edt, ".")[0], locE)
	if err2 != nil {
		t2, err2 = time.Parse(time.RFC3339, edt)
		if err2 != nil {
			return time.Time{}, time.Time{}, false
		}
	}
	return t1, t2, true
}
