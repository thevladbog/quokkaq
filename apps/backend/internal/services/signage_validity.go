package services

import (
	"time"

	"quokkaq-go-backend/internal/models"
)

// ymdStringFromDatePtr is the YYYY-MM-DD of a DATE column (read as time at UTC midnight).
func ymdStringFromDatePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format("2006-01-02")
}

// civilYMDStringAt returns YYYY-MM-DD for t’s civil date in the given IANA zone.
func civilYMDStringAt(t time.Time, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	n := t.In(loc)
	y, m, d := n.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
}

// scheduleInCalendarWindow returns true if the civil "today" string is within [ValidFrom, ValidTo] inclusive, when set.
func scheduleInCalendarWindow(sc *models.PlaylistSchedule, todayYMD string) bool {
	if sc == nil {
		return true
	}
	if sc.ValidFrom != nil {
		if ymdStringFromDatePtr(sc.ValidFrom) > todayYMD {
			return false
		}
	}
	if sc.ValidTo != nil {
		if ymdStringFromDatePtr(sc.ValidTo) < todayYMD {
			return false
		}
	}
	return true
}

// playlistItemInCalendarWindow returns true if todayYMD is within the item’s ValidFrom/ValidTo, when set.
func playlistItemInCalendarWindow(it *models.PlaylistItem, todayYMD string) bool {
	if it == nil {
		return true
	}
	if it.ValidFrom != nil {
		if ymdStringFromDatePtr(it.ValidFrom) > todayYMD {
			return false
		}
	}
	if it.ValidTo != nil {
		if ymdStringFromDatePtr(it.ValidTo) < todayYMD {
			return false
		}
	}
	return true
}

// filterActivePlaylistItems keeps only items valid for todayYMD. Mutates a shallow copy; nil-safe.
func filterActivePlaylistItems(p *models.Playlist, todayYMD string) *models.Playlist {
	if p == nil {
		return nil
	}
	out := make([]models.PlaylistItem, 0, len(p.Items))
	for i := range p.Items {
		if playlistItemInCalendarWindow(&p.Items[i], todayYMD) {
			out = append(out, p.Items[i])
		}
	}
	c := *p
	c.Items = out
	return &c
}
