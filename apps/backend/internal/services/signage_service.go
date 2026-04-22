package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	"github.com/mmcdole/gofeed"
	"gorm.io/gorm"
)

// SignageService manages digital signage playlists, schedules, external feeds, and screen announcements.
type SignageService interface {
	// Playlists
	ListPlaylists(unitID string) ([]models.Playlist, error)
	GetPlaylist(playlistID string) (*models.Playlist, error)
	CreatePlaylist(unitID string, p *models.Playlist, items []models.PlaylistItem) error
	UpdatePlaylist(unitID, playlistID string, p *models.Playlist, items []models.PlaylistItem) error
	DeletePlaylist(unitID, playlistID string) error
	// Schedules
	ListSchedules(unitID string) ([]models.PlaylistSchedule, error)
	GetSchedule(scheduleID string) (*models.PlaylistSchedule, error)
	CreateSchedule(unitID string, s *models.PlaylistSchedule) error
	UpdateSchedule(unitID, scheduleID string, s *models.PlaylistSchedule) error
	DeleteSchedule(unitID, scheduleID string) error
	// Public: resolved playlist for the ticket screen
	ActivePlaylist(ctx context.Context, unitID string) (*ActivePlaylistDTO, error)
	// Feeds
	ListFeeds(unitID string) ([]models.ExternalFeed, error)
	GetFeed(feedID string) (*models.ExternalFeed, error)
	PublicFeedData(unitID, feedID string) (json.RawMessage, error)
	CreateFeed(unitID string, f *models.ExternalFeed) error
	UpdateFeed(unitID, feedID string, f *models.ExternalFeed) error
	DeleteFeed(unitID, feedID string) error
	PollFeedByID(ctx context.Context, feedID string) error
	PollDueFeeds(ctx context.Context) error
	// Announcements
	ListAnnouncements(unitID string, all bool) ([]models.ScreenAnnouncement, error)
	PublicAnnouncements(unitID string) ([]models.ScreenAnnouncement, error)
	GetAnnouncement(id string) (*models.ScreenAnnouncement, error)
	CreateAnnouncement(unitID string, a *models.ScreenAnnouncement) error
	UpdateAnnouncement(unitID, annID string, a *models.ScreenAnnouncement) error
	DeleteAnnouncement(unitID, annID string) error
}

// ActivePlaylistDTO is the public wire shape for the currently effective playlist.
type ActivePlaylistDTO struct {
	Source   string           `json:"source"` // schedule | default | none
	Playlist *models.Playlist `json:"playlist,omitempty"`
	UnitID   string           `json:"unitId"`
}

type signageService struct {
	signageRepo repository.SignageRepository
	unitRepo    repository.UnitRepository
	hub         *ws.Hub
	httpClient  *http.Client
}

// NewSignageService constructs the signage service.
func NewSignageService(signageRepo repository.SignageRepository, unitRepo repository.UnitRepository, hub *ws.Hub) SignageService {
	return &signageService{
		signageRepo: signageRepo,
		unitRepo:    unitRepo,
		hub:         hub,
		httpClient:  &http.Client{Timeout: 25 * time.Second},
	}
}

// WebSocketRoomIDForUnit matches the frontend /screen room (service_zone → parent subdivision).
func WebSocketRoomIDForUnit(u *models.Unit) string {
	if u == nil {
		return ""
	}
	if u.Kind == models.UnitKindServiceZone && u.ParentID != nil && *u.ParentID != "" {
		return *u.ParentID
	}
	return u.ID
}

func (s *signageService) wsBroadcastForUnit(u *models.Unit, event string, data map[string]interface{}) {
	if s.hub == nil || u == nil {
		return
	}
	room := WebSocketRoomIDForUnit(u)
	if data == nil {
		data = map[string]interface{}{}
	}
	data["unitId"] = room
	s.hub.BroadcastEvent(event, data, room)
}

func (s *signageService) assertPlaylistUnit(playlistID, wantUnitID string) (*models.Playlist, error) {
	p, err := s.signageRepo.GetPlaylistByID(playlistID)
	if err != nil {
		return nil, err
	}
	if p.UnitID != wantUnitID {
		return nil, gorm.ErrRecordNotFound
	}
	return p, nil
}

// --- Playlists ---

func (s *signageService) ListPlaylists(unitID string) ([]models.Playlist, error) {
	return s.signageRepo.ListPlaylistsByUnit(unitID)
}

func (s *signageService) GetPlaylist(playlistID string) (*models.Playlist, error) {
	return s.signageRepo.GetPlaylistByIDWithItems(playlistID)
}

func (s *signageService) CreatePlaylist(unitID string, p *models.Playlist, items []models.PlaylistItem) error {
	unit, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	if unit == nil {
		return gorm.ErrRecordNotFound
	}
	p.UnitID = unitID
	if err := s.signageRepo.CreatePlaylist(p); err != nil {
		return err
	}
	if p.IsDefault {
		if err := s.signageRepo.UnsetDefaultPlaylistsForUnit(p.ID, unitID); err != nil {
			return err
		}
	}
	if err := s.buildPlaylistItems(p.ID, unitID, items); err != nil {
		return err
	}
	unitFull, _ := s.unitRepo.FindByIDLight(unitID)
	if unitFull != nil {
		s.wsBroadcastForUnit(unitFull, "screen.content_updated", map[string]interface{}{"kind": "playlist", "playlistId": p.ID})
	}
	return nil
}

func (s *signageService) buildPlaylistItems(playlistID, unitID string, items []models.PlaylistItem) error {
	mats, err := s.unitRepo.GetMaterials(unitID)
	if err != nil {
		return err
	}
	allowed := make(map[string]struct{}, len(mats))
	for _, m := range mats {
		allowed[m.ID] = struct{}{}
	}
	out := make([]models.PlaylistItem, 0, len(items))
	for i := range items {
		it := items[i]
		if it.MaterialID == "" {
			return fmt.Errorf("materialId required for item %d", i)
		}
		if _, ok := allowed[it.MaterialID]; !ok {
			return fmt.Errorf("material %s not in unit", it.MaterialID)
		}
		it.ID = ""
		it.PlaylistID = playlistID
		if it.Duration < 0 {
			it.Duration = 0
		}
		it.SortOrder = i
		out = append(out, it)
	}
	if err := s.signageRepo.ReplacePlaylistItems(playlistID, out); err != nil {
		return err
	}
	return nil
}

func (s *signageService) UpdatePlaylist(unitID, playlistID string, p *models.Playlist, items []models.PlaylistItem) error {
	existing, err := s.assertPlaylistUnit(playlistID, unitID)
	if err != nil {
		return err
	}
	existing.Name = p.Name
	existing.Description = p.Description
	existing.IsDefault = p.IsDefault
	if err := s.signageRepo.UpdatePlaylist(existing); err != nil {
		return err
	}
	if existing.IsDefault {
		if err := s.signageRepo.UnsetDefaultPlaylistsForUnit(existing.ID, unitID); err != nil {
			return err
		}
	}
	if err := s.buildPlaylistItems(playlistID, unitID, items); err != nil {
		return err
	}
	unitFull, _ := s.unitRepo.FindByIDLight(unitID)
	if unitFull != nil {
		s.wsBroadcastForUnit(unitFull, "screen.content_updated", map[string]interface{}{"kind": "playlist", "playlistId": playlistID})
	}
	return nil
}

func (s *signageService) DeletePlaylist(unitID, playlistID string) error {
	if _, err := s.assertPlaylistUnit(playlistID, unitID); err != nil {
		return err
	}
	if err := s.signageRepo.DeletePlaylist(playlistID); err != nil {
		return err
	}
	unitFull, _ := s.unitRepo.FindByIDLight(unitID)
	if unitFull != nil {
		s.wsBroadcastForUnit(unitFull, "screen.content_updated", map[string]interface{}{"kind": "playlist", "playlistId": playlistID, "deleted": true})
	}
	return nil
}

// --- Schedules ---

func (s *signageService) assertScheduleUnit(scheduleID, want string) (*models.PlaylistSchedule, error) {
	sc, err := s.signageRepo.GetScheduleByID(scheduleID)
	if err != nil {
		return nil, err
	}
	if sc.UnitID != want {
		return nil, gorm.ErrRecordNotFound
	}
	return sc, nil
}

func (s *signageService) ListSchedules(unitID string) ([]models.PlaylistSchedule, error) {
	return s.signageRepo.ListSchedulesByUnit(unitID)
}

func (s *signageService) GetSchedule(scheduleID string) (*models.PlaylistSchedule, error) {
	return s.signageRepo.GetScheduleByID(scheduleID)
}

func (s *signageService) CreateSchedule(unitID string, sc *models.PlaylistSchedule) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	if u == nil {
		return gorm.ErrRecordNotFound
	}
	if sc.PlaylistID != "" {
		if _, err := s.assertPlaylistUnit(sc.PlaylistID, unitID); err != nil {
			return err
		}
	}
	sc.UnitID = unitID
	if sc.DaysOfWeek == "" {
		sc.DaysOfWeek = "1,2,3,4,5,6,7"
	}
	if err := s.signageRepo.CreateSchedule(sc); err != nil {
		return err
	}
	s.wsBroadcastForUnit(u, "screen.content_updated", map[string]interface{}{"kind": "schedule", "scheduleId": sc.ID})
	return nil
}

func (s *signageService) UpdateSchedule(unitID, scheduleID string, sc *models.PlaylistSchedule) error {
	_, err := s.assertScheduleUnit(scheduleID, unitID)
	if err != nil {
		return err
	}
	if sc.PlaylistID != "" {
		if _, err := s.assertPlaylistUnit(sc.PlaylistID, unitID); err != nil {
			return err
		}
	}
	sc.ID = scheduleID
	sc.UnitID = unitID
	if err := s.signageRepo.UpdateSchedule(sc); err != nil {
		return err
	}
	u, _ := s.unitRepo.FindByIDLight(unitID)
	if u != nil {
		s.wsBroadcastForUnit(u, "screen.content_updated", map[string]interface{}{"kind": "schedule", "scheduleId": scheduleID})
	}
	return nil
}

func (s *signageService) DeleteSchedule(unitID, scheduleID string) error {
	_, err := s.assertScheduleUnit(scheduleID, unitID)
	if err != nil {
		return err
	}
	if err := s.signageRepo.DeleteSchedule(scheduleID); err != nil {
		return err
	}
	u, _ := s.unitRepo.FindByIDLight(unitID)
	if u != nil {
		s.wsBroadcastForUnit(u, "screen.content_updated", map[string]interface{}{"kind": "schedule", "scheduleId": scheduleID, "deleted": true})
	}
	return nil
}

func parseDaySet(days string) map[int]struct{} {
	out := map[int]struct{}{}
	for _, p := range strings.Split(days, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 7 {
			continue
		}
		out[n] = struct{}{}
	}
	if len(out) == 0 {
		for i := 1; i <= 7; i++ {
			out[i] = struct{}{}
		}
	}
	return out
}

func weekdayOneToSeven(t time.Time) int {
	// Mon=1 .. Sun=7
	wd := int(t.Weekday()) // Sun=0, Mon=1, ...
	if wd == 0 {
		return 7
	}
	return wd
}

func parseHHMM(s string) (int, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, errors.New("invalid time")
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, errors.New("invalid time")
	}
	return h*60 + m, nil
}

func timeInWindow(curMin, startMin, endMin int) bool {
	if endMin == startMin {
		return true
	}
	if startMin < endMin {
		return curMin >= startMin && curMin < endMin
	}
	// overnight
	return curMin >= startMin || curMin < endMin
}

func (s *signageService) ActivePlaylist(ctx context.Context, unitID string) (*ActivePlaylistDTO, error) {
	_ = ctx
	unit, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return nil, err
	}
	if unit == nil {
		return nil, gorm.ErrRecordNotFound
	}
	loc, err := time.LoadLocation(unit.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	curD := weekdayOneToSeven(now)
	curMin, _ := parseHHMM(now.Format("15:04"))

	schedules, err := s.signageRepo.ListSchedulesByUnit(unitID)
	if err != nil {
		return nil, err
	}
	type candidate struct {
		priority int
		pID      string
		sid      string
	}
	var cands []candidate
	for _, sc := range schedules {
		if !sc.IsActive {
			continue
		}
		days := parseDaySet(sc.DaysOfWeek)
		if _, ok := days[curD]; !ok {
			continue
		}
		startMin, err1 := parseHHMM(sc.StartTime)
		endMin, err2 := parseHHMM(sc.EndTime)
		if err1 != nil || err2 != nil {
			continue
		}
		if !timeInWindow(curMin, startMin, endMin) {
			continue
		}
		cands = append(cands, candidate{priority: sc.Priority, pID: sc.PlaylistID, sid: sc.ID})
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].priority != cands[j].priority {
			return cands[i].priority > cands[j].priority
		}
		return cands[i].sid < cands[j].sid
	})

	if len(cands) > 0 {
		pl, err := s.signageRepo.GetPlaylistByIDWithItems(cands[0].pID)
		if err != nil {
			return nil, err
		}
		if pl != nil && pl.UnitID == unitID {
			return &ActivePlaylistDTO{Source: "schedule", Playlist: pl, UnitID: unitID}, nil
		}
	}
	// default playlist
	lists, err := s.signageRepo.ListPlaylistsByUnit(unitID)
	if err != nil {
		return nil, err
	}
	for _, p := range lists {
		if p.IsDefault {
			full, err := s.signageRepo.GetPlaylistByIDWithItems(p.ID)
			if err != nil {
				return nil, err
			}
			return &ActivePlaylistDTO{Source: "default", Playlist: full, UnitID: unitID}, nil
		}
	}
	// any playlist
	if len(lists) > 0 {
		full, err := s.signageRepo.GetPlaylistByIDWithItems(lists[0].ID)
		if err != nil {
			return nil, err
		}
		return &ActivePlaylistDTO{Source: "default", Playlist: full, UnitID: unitID}, nil
	}
	return &ActivePlaylistDTO{Source: "none", UnitID: unitID}, nil
}

// --- Feeds ---

func (s *signageService) assertFeedUnit(feedID, want string) (*models.ExternalFeed, error) {
	f, err := s.signageRepo.GetFeedByID(feedID)
	if err != nil {
		return nil, err
	}
	if f.UnitID != want {
		return nil, gorm.ErrRecordNotFound
	}
	return f, nil
}

func (s *signageService) ListFeeds(unitID string) ([]models.ExternalFeed, error) {
	return s.signageRepo.ListFeedsByUnit(unitID)
}

func (s *signageService) GetFeed(feedID string) (*models.ExternalFeed, error) {
	return s.signageRepo.GetFeedByID(feedID)
}

func (s *signageService) PublicFeedData(unitID, feedID string) (json.RawMessage, error) {
	f, err := s.assertFeedUnit(feedID, unitID)
	if err != nil {
		return nil, err
	}
	if len(f.CachedData) == 0 {
		return []byte("null"), nil
	}
	return f.CachedData, nil
}

func (s *signageService) CreateFeed(unitID string, f *models.ExternalFeed) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	if u == nil {
		return gorm.ErrRecordNotFound
	}
	f.UnitID = unitID
	if f.PollInterval < 30 {
		f.PollInterval = 300
	}
	if err := s.signageRepo.CreateFeed(f); err != nil {
		return err
	}
	_ = s.PollFeedByID(context.Background(), f.ID)
	s.wsBroadcastForUnit(u, "feed.updated", map[string]interface{}{"kind": "feed", "feedId": f.ID})
	return nil
}

func (s *signageService) UpdateFeed(unitID, feedID string, f *models.ExternalFeed) error {
	existing, err := s.assertFeedUnit(feedID, unitID)
	if err != nil {
		return err
	}
	f.ID = existing.ID
	f.UnitID = unitID
	if f.PollInterval < 30 {
		f.PollInterval = 300
	}
	if err := s.signageRepo.UpdateFeed(f); err != nil {
		return err
	}
	u, _ := s.unitRepo.FindByIDLight(unitID)
	if u != nil {
		s.wsBroadcastForUnit(u, "screen.content_updated", map[string]interface{}{"kind": "feed", "feedId": f.ID})
	}
	return nil
}

func (s *signageService) DeleteFeed(unitID, feedID string) error {
	if _, err := s.assertFeedUnit(feedID, unitID); err != nil {
		return err
	}
	if err := s.signageRepo.DeleteFeed(feedID); err != nil {
		return err
	}
	u, _ := s.unitRepo.FindByIDLight(unitID)
	if u != nil {
		s.wsBroadcastForUnit(u, "screen.content_updated", map[string]interface{}{"kind": "feed", "feedId": feedID, "deleted": true})
	}
	return nil
}

// PollFeedByID fetches remote data and stores cachedData.
func (s *signageService) PollFeedByID(ctx context.Context, feedID string) error {
	f, err := s.signageRepo.GetFeedByID(feedID)
	if err != nil {
		return err
	}
	if !f.IsActive {
		return nil
	}
	var raw json.RawMessage
	var errFetch error
	switch strings.ToLower(f.Type) {
	case "rss":
		raw, errFetch = s.pollRSS(ctx, f.URL)
	case "weather":
		raw, errFetch = s.pollWeather(f.Config, f.URL)
	case "custom_url", "custom":
		raw, errFetch = s.pollCustomURL(ctx, f.URL)
	default:
		errFetch = fmt.Errorf("unknown feed type: %s", f.Type)
	}
	now := time.Now()
	f.LastFetchAt = &now
	if errFetch != nil {
		f.LastError = errFetch.Error()
	} else {
		f.LastError = ""
		f.CachedData = raw
	}
	if err := s.signageRepo.UpdateFeed(f); err != nil {
		return err
	}
	unit, _ := s.unitRepo.FindByIDLight(f.UnitID)
	if unit != nil {
		room := WebSocketRoomIDForUnit(unit)
		if s.hub != nil {
			s.hub.BroadcastEvent("feed.updated", map[string]interface{}{
				"unitId": room,
				"feedId": f.ID,
			}, room)
		}
	}
	return nil
}

func (s *signageService) pollRSS(_ context.Context, u string) (json.RawMessage, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(u)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]interface{}, 0, 12)
	for i, it := range feed.Items {
		if i >= 12 {
			break
		}
		m := map[string]interface{}{
			"title":   it.Title,
			"link":    it.Link,
			"pubDate": it.Published,
		}
		if it.Description != "" {
			m["summary"] = it.Description
		} else {
			m["summary"] = it.Content
		}
		items = append(items, m)
	}
	out := map[string]interface{}{
		"type":  "rss",
		"title": feed.Title,
		"items": items,
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (s *signageService) pollWeather(config json.RawMessage, fallbackURL string) (json.RawMessage, error) {
	type cfg struct {
		Lat *float64 `json:"lat"`
		Lon *float64 `json:"lon"`
	}
	var c cfg
	_ = json.Unmarshal(config, &c)
	if c.Lat != nil && c.Lon != nil {
		u := fmt.Sprintf("https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,weather_code&timezone=auto", *c.Lat, *c.Lon)
		return s.httpGetJSON(u)
	}
	if strings.TrimSpace(fallbackURL) != "" {
		return s.httpGetJSON(fallbackURL)
	}
	return nil, errors.New("weather feed requires config.lat / config.lon or a URL")
}

func (s *signageService) pollCustomURL(ctx context.Context, u string) (json.RawMessage, error) {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			time.Sleep(time.Duration(200*int(math.Pow(2, float64(attempt-1)))) * time.Millisecond)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		res, err := s.httpClient.Do(req)
		if err != nil {
			last = err
			continue
		}
		b, rerr := func() ([]byte, error) {
			defer func() { _ = res.Body.Close() }()
			return io.ReadAll(io.LimitReader(res.Body, 2<<20))
		}()
		if rerr != nil {
			last = rerr
			continue
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			last = fmt.Errorf("HTTP %d", res.StatusCode)
			continue
		}
		var js json.RawMessage
		if err := json.Unmarshal(b, &js); err == nil {
			return js, nil
		}
		wrap, _ := json.Marshal(map[string]interface{}{"type": "text", "body": string(b)})
		return wrap, nil
	}
	if last != nil {
		return nil, last
	}
	return nil, errors.New("pollCustomURL: exhausted retries")
}

func (s *signageService) httpGetJSON(u string) (json.RawMessage, error) {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(200*int(math.Pow(2, float64(attempt-1)))) * time.Millisecond)
		}
		res, err := s.httpClient.Get(u)
		if err != nil {
			last = err
			continue
		}
		b, rerr := func() ([]byte, error) {
			defer func() { _ = res.Body.Close() }()
			return io.ReadAll(io.LimitReader(res.Body, 2<<20))
		}()
		if rerr != nil {
			last = rerr
			continue
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			last = fmt.Errorf("HTTP %d", res.StatusCode)
			continue
		}
		return json.RawMessage(b), nil
	}
	if last != nil {
		return nil, last
	}
	return nil, errors.New("httpGetJSON: exhausted retries")
}

// PollDueFeeds runs polling for all active feeds that are past their interval.
func (s *signageService) PollDueFeeds(ctx context.Context) error {
	feeds, err := s.signageRepo.ListActiveFeeds()
	if err != nil {
		return err
	}
	now := time.Now()
	for _, f := range feeds {
		interval := time.Duration(f.PollInterval) * time.Second
		if f.LastFetchAt != nil && now.Sub(*f.LastFetchAt) < interval {
			continue
		}
		_ = s.PollFeedByID(ctx, f.ID)
	}
	return nil
}

// --- Announcements ---

func (s *signageService) assertAnnouncement(annID, want string) (*models.ScreenAnnouncement, error) {
	a, err := s.signageRepo.GetAnnouncementByID(annID)
	if err != nil {
		return nil, err
	}
	if a.UnitID != want {
		return nil, gorm.ErrRecordNotFound
	}
	return a, nil
}

func (s *signageService) ListAnnouncements(unitID string, all bool) ([]models.ScreenAnnouncement, error) {
	return s.signageRepo.ListAnnouncementsByUnit(unitID, !all)
}

func (s *signageService) PublicAnnouncements(unitID string) ([]models.ScreenAnnouncement, error) {
	return s.signageRepo.ListActiveAnnouncementsForPublic(unitID)
}

func (s *signageService) GetAnnouncement(id string) (*models.ScreenAnnouncement, error) {
	return s.signageRepo.GetAnnouncementByID(id)
}

func (s *signageService) CreateAnnouncement(unitID string, a *models.ScreenAnnouncement) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	if u == nil {
		return gorm.ErrRecordNotFound
	}
	a.UnitID = unitID
	if a.Style == "" {
		a.Style = "info"
	}
	if err := s.signageRepo.CreateAnnouncement(a); err != nil {
		return err
	}
	room := WebSocketRoomIDForUnit(u)
	if s.hub != nil {
		s.hub.BroadcastEvent("screen.announcement", map[string]interface{}{
			"unitId": room,
			"action": "created",
			"id":     a.ID,
		}, room)
	}
	return nil
}

func (s *signageService) UpdateAnnouncement(unitID, annID string, a *models.ScreenAnnouncement) error {
	existing, err := s.assertAnnouncement(annID, unitID)
	if err != nil {
		return err
	}
	existing.Text = a.Text
	existing.Priority = a.Priority
	existing.Style = a.Style
	if existing.Style == "" {
		existing.Style = "info"
	}
	existing.IsActive = a.IsActive
	existing.StartsAt = a.StartsAt
	existing.ExpiresAt = a.ExpiresAt
	if err := s.signageRepo.UpdateAnnouncement(existing); err != nil {
		return err
	}
	u, _ := s.unitRepo.FindByIDLight(unitID)
	if u != nil {
		room := WebSocketRoomIDForUnit(u)
		if s.hub != nil {
			s.hub.BroadcastEvent("screen.announcement", map[string]interface{}{
				"unitId": room,
				"action": "updated",
				"id":     annID,
			}, room)
		}
	}
	return nil
}

func (s *signageService) DeleteAnnouncement(unitID, annID string) error {
	_, err := s.assertAnnouncement(annID, unitID)
	if err != nil {
		return err
	}
	unit, _ := s.unitRepo.FindByIDLight(unitID)
	if err := s.signageRepo.DeleteAnnouncement(annID); err != nil {
		return err
	}
	if unit != nil {
		room := WebSocketRoomIDForUnit(unit)
		if s.hub != nil {
			s.hub.BroadcastEvent("screen.announcement", map[string]interface{}{
				"unitId": room,
				"action": "deleted",
				"id":     annID,
			}, room)
		}
	}
	return nil
}
