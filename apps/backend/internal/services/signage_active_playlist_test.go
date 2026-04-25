package services

import (
	"context"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// testUnitLightRepo is only for FindByIDLight; other [repository.UnitRepository] methods must not be called in these tests.
type testUnitLightRepo struct {
	repository.UnitRepository
	unit *models.Unit
}

func (r *testUnitLightRepo) FindByIDLight(string) (*models.Unit, error) {
	if r.unit != nil {
		return r.unit, nil
	}
	return &models.Unit{ID: "u1", Timezone: "UTC"}, nil
}
func (r *testUnitLightRepo) FindByIDLightTxForUpdate(_ *gorm.DB, id string) (*models.Unit, error) {
	return r.FindByIDLight(id)
}

// apTestSignage is a minimal fake for [SignageService.ActivePlaylist] paths.
type apTestSignage struct {
	schedules []models.PlaylistSchedule
	byID      map[string]*models.Playlist
	lists     []models.Playlist
}

func (a *apTestSignage) ListPlaylistsByUnit(string) ([]models.Playlist, error) {
	if a == nil {
		return nil, nil
	}
	return a.lists, nil
}
func (a *apTestSignage) CountPlaylistsByUnitWithName(_ string, name string) (int64, error) {
	if a == nil {
		return 0, nil
	}
	var n int64
	for i := range a.lists {
		if a.lists[i].Name == name {
			n++
		}
	}
	return n, nil
}
func (a *apTestSignage) GetPlaylistByIDWithItems(id string) (*models.Playlist, error) {
	if a == nil || a.byID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	p, ok := a.byID[id]
	if !ok || p == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return p, nil
}
func (a *apTestSignage) GetPlaylistByID(id string) (*models.Playlist, error) {
	return a.GetPlaylistByIDWithItems(id)
}
func (a *apTestSignage) ListSchedulesByUnit(string) ([]models.PlaylistSchedule, error) {
	if a == nil {
		return nil, nil
	}
	return a.schedules, nil
}
func (a *apTestSignage) GetScheduleByID(string) (*models.PlaylistSchedule, error) {
	return nil, gorm.ErrRecordNotFound
}
func (a *apTestSignage) CreatePlaylist(*models.Playlist) error                    { return nil }
func (a *apTestSignage) UpdatePlaylist(*models.Playlist) error                    { return nil }
func (a *apTestSignage) DeletePlaylist(string) error                              { return gorm.ErrRecordNotFound }
func (a *apTestSignage) ReplacePlaylistItems(string, []models.PlaylistItem) error { return nil }
func (a *apTestSignage) UnsetDefaultPlaylistsForUnit(string, string) error        { return nil }
func (a *apTestSignage) CreateSchedule(*models.PlaylistSchedule) error            { return nil }
func (a *apTestSignage) UpdateSchedule(*models.PlaylistSchedule) error            { return nil }
func (a *apTestSignage) DeleteSchedule(string) error                              { return gorm.ErrRecordNotFound }
func (a *apTestSignage) ListFeedsByUnit(string) ([]models.ExternalFeed, error)    { return nil, nil }
func (a *apTestSignage) GetFeedByID(string) (*models.ExternalFeed, error) {
	return nil, gorm.ErrRecordNotFound
}
func (a *apTestSignage) CreateFeed(*models.ExternalFeed) error { return nil }
func (a *apTestSignage) UpdateFeed(*models.ExternalFeed) error { return nil }
func (a *apTestSignage) DeleteFeed(string) error               { return gorm.ErrRecordNotFound }
func (a *apTestSignage) WithFeedLockedForUpdate(_ context.Context, _ string, _ func(*models.ExternalFeed) error) error {
	return nil
}
func (a *apTestSignage) ListActiveFeeds() ([]models.ExternalFeed, error) { return nil, nil }
func (a *apTestSignage) ListAnnouncementsByUnit(string, bool) ([]models.ScreenAnnouncement, error) {
	return nil, nil
}
func (a *apTestSignage) ListActiveAnnouncementsForPublic(string) ([]models.ScreenAnnouncement, error) {
	return nil, nil
}
func (a *apTestSignage) GetAnnouncementByID(string) (*models.ScreenAnnouncement, error) {
	return nil, gorm.ErrRecordNotFound
}
func (a *apTestSignage) CreateAnnouncement(*models.ScreenAnnouncement) error { return nil }
func (a *apTestSignage) UpdateAnnouncement(*models.ScreenAnnouncement) error { return nil }
func (a *apTestSignage) DeleteAnnouncement(string) error                     { return gorm.ErrRecordNotFound }

var _ repository.SignageRepository = (*apTestSignage)(nil)

func d(y int, m time.Month, day int) *time.Time {
	t := time.Date(y, m, day, 0, 0, 0, 0, time.UTC)
	return &t
}

func withFixedClock(t time.Time, fn func()) {
	orig := activePlaylistNow
	activePlaylistNow = func() time.Time { return t }
	defer func() { activePlaylistNow = orig }()
	fn()
}

func TestActivePlaylist_scheduleWinsInWindow(t *testing.T) {
	// Wed 15 Jan 2025 12:00 UTC
	n := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	sched := []models.PlaylistSchedule{
		{ID: "s1", UnitID: "u1", PlaylistID: "pl1", DaysOfWeek: "1,2,3,4,5", StartTime: "09:00", EndTime: "18:00",
			ValidFrom: d(2025, 1, 1), ValidTo: d(2025, 1, 31), Priority: 1, IsActive: true},
	}
	p1 := &models.Playlist{ID: "pl1", UnitID: "u1", Name: "A", IsDefault: false, Items: []models.PlaylistItem{
		{ID: "i1", MaterialID: "m1", SortOrder: 0, Duration: 10},
	}}
	pDef := &models.Playlist{ID: "plDef", UnitID: "u1", Name: "Def", IsDefault: true, Items: []models.PlaylistItem{
		{ID: "d1", MaterialID: "m2", SortOrder: 0, Duration: 5},
	}}
	fake := &apTestSignage{schedules: sched, byID: map[string]*models.Playlist{"pl1": p1, "plDef": pDef},
		lists: []models.Playlist{*p1, *pDef}}
	unitR := &testUnitLightRepo{unit: &models.Unit{ID: "u1", Timezone: "UTC"}}
	svc := NewSignageService(fake, unitR, nil)
	withFixedClock(n, func() {
		ap, err := svc.ActivePlaylist(context.Background(), "u1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if ap.Source != "schedule" || ap.Playlist == nil || ap.Playlist.ID != "pl1" {
			t.Fatalf("got %+v", ap)
		}
		if len(ap.Playlist.Items) != 1 {
			t.Fatalf("items: %+v", ap.Playlist.Items)
		}
	})
}

func TestActivePlaylist_calendarSkipsToDefault(t *testing.T) {
	n := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	sched := []models.PlaylistSchedule{
		{ID: "s1", UnitID: "u1", PlaylistID: "pl1", DaysOfWeek: "1,2,3,4,5", StartTime: "09:00", EndTime: "18:00",
			ValidFrom: d(2025, 1, 1), ValidTo: d(2025, 1, 10), Priority: 2, IsActive: true},
	}
	p1 := &models.Playlist{ID: "pl1", UnitID: "u1", Name: "A", IsDefault: false, Items: []models.PlaylistItem{
		{ID: "i1", MaterialID: "m1", SortOrder: 0, Duration: 10},
	}}
	pDef := &models.Playlist{ID: "plDef", UnitID: "u1", Name: "Def", IsDefault: true, Items: []models.PlaylistItem{
		{ID: "d1", MaterialID: "m2", SortOrder: 0, Duration: 5},
	}}
	fake := &apTestSignage{schedules: sched, byID: map[string]*models.Playlist{"pl1": p1, "plDef": pDef},
		lists: []models.Playlist{*p1, *pDef}}
	unitR := &testUnitLightRepo{unit: &models.Unit{ID: "u1", Timezone: "UTC"}}
	svc := NewSignageService(fake, unitR, nil)
	withFixedClock(n, func() {
		ap, err := svc.ActivePlaylist(context.Background(), "u1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if ap.Source != "default" || ap.Playlist == nil || ap.Playlist.ID != "plDef" {
			t.Fatalf("got %+v", ap)
		}
	})
}

func TestActivePlaylist_timeWindowSkipsToDefault(t *testing.T) {
	n := time.Date(2025, 1, 15, 20, 30, 0, 0, time.UTC) // 20:30, outside 09-18
	sched := []models.PlaylistSchedule{
		{ID: "s1", UnitID: "u1", PlaylistID: "pl1", DaysOfWeek: "1,2,3,4,5", StartTime: "09:00", EndTime: "18:00",
			ValidFrom: d(2025, 1, 1), ValidTo: d(2025, 1, 31), Priority: 1, IsActive: true},
	}
	p1 := &models.Playlist{ID: "pl1", UnitID: "u1", Name: "A", IsDefault: false, Items: []models.PlaylistItem{
		{ID: "i1", MaterialID: "m1", SortOrder: 0, Duration: 10},
	}}
	pDef := &models.Playlist{ID: "plDef", UnitID: "u1", Name: "Def", IsDefault: true, Items: []models.PlaylistItem{
		{ID: "d1", MaterialID: "m2", SortOrder: 0, Duration: 5},
	}}
	fake := &apTestSignage{schedules: sched, byID: map[string]*models.Playlist{"pl1": p1, "plDef": pDef},
		lists: []models.Playlist{*p1, *pDef}}
	unitR := &testUnitLightRepo{unit: &models.Unit{ID: "u1", Timezone: "UTC"}}
	svc := NewSignageService(fake, unitR, nil)
	withFixedClock(n, func() {
		ap, err := svc.ActivePlaylist(context.Background(), "u1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if ap.Source != "default" || ap.Playlist == nil || ap.Playlist.ID != "plDef" {
			t.Fatalf("got %+v", ap)
		}
	})
}

func TestActivePlaylist_higherPriorityWins(t *testing.T) {
	n := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	sched := []models.PlaylistSchedule{
		{ID: "low", UnitID: "u1", PlaylistID: "plLo", DaysOfWeek: "1,2,3,4,5,6,7", StartTime: "00:00", EndTime: "23:59",
			Priority: 1, IsActive: true},
		{ID: "hi", UnitID: "u1", PlaylistID: "plHi", DaysOfWeek: "1,2,3,4,5,6,7", StartTime: "00:00", EndTime: "23:59",
			Priority: 5, IsActive: true},
	}
	plLo := &models.Playlist{ID: "plLo", UnitID: "u1", Name: "Lo", Items: []models.PlaylistItem{
		{ID: "a1", MaterialID: "m1", SortOrder: 0, Duration: 10},
	}}
	plHi := &models.Playlist{ID: "plHi", UnitID: "u1", Name: "Hi", Items: []models.PlaylistItem{
		{ID: "a2", MaterialID: "m2", SortOrder: 0, Duration: 10},
	}}
	fake := &apTestSignage{schedules: sched, byID: map[string]*models.Playlist{"plLo": plLo, "plHi": plHi},
		lists: []models.Playlist{*plLo, *plHi}}
	unitR := &testUnitLightRepo{unit: &models.Unit{ID: "u1", Timezone: "UTC"}}
	svc := NewSignageService(fake, unitR, nil)
	withFixedClock(n, func() {
		ap, err := svc.ActivePlaylist(context.Background(), "u1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if ap.Source != "schedule" || ap.Playlist == nil || ap.Playlist.ID != "plHi" {
			t.Fatalf("got %+v", ap)
		}
	})
}

func TestActivePlaylist_filtersExpiredItems(t *testing.T) {
	n := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	sched := []models.PlaylistSchedule{
		{ID: "s1", UnitID: "u1", PlaylistID: "pl1", DaysOfWeek: "1,2,3,4,5,6,7", StartTime: "00:00", EndTime: "23:59", Priority: 1, IsActive: true},
	}
	expired := d(2019, 12, 31)
	p1 := &models.Playlist{ID: "pl1", UnitID: "u1", Name: "A", Items: []models.PlaylistItem{
		{ID: "i1", MaterialID: "m1", SortOrder: 0, Duration: 10, ValidFrom: d(2019, 1, 1), ValidTo: expired},
	}}
	fake := &apTestSignage{schedules: sched, byID: map[string]*models.Playlist{"pl1": p1},
		lists: []models.Playlist{*p1}}
	unitR := &testUnitLightRepo{unit: &models.Unit{ID: "u1", Timezone: "UTC"}}
	svc := NewSignageService(fake, unitR, nil)
	withFixedClock(n, func() {
		ap, err := svc.ActivePlaylist(context.Background(), "u1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if ap.Source != "schedule" || ap.Playlist == nil {
			t.Fatalf("got %+v", ap)
		}
		if len(ap.Playlist.Items) != 0 {
			t.Fatalf("expected empty after filter, got %d", len(ap.Playlist.Items))
		}
	})
}

func TestCivilYMDStringAt_offsetZone(t *testing.T) {
	t.Parallel()
	east8 := time.FixedZone("E8", 8*3600)
	// 2024-07-10 16:00 UTC => 2024-07-11 00:00 +08, civil YMD 2024-07-11
	tm := time.Date(2024, 7, 10, 16, 0, 0, 0, time.UTC)
	day := civilYMDStringAt(tm, east8)
	if day != "2024-07-11" {
		t.Fatalf("got %s", day)
	}
}
