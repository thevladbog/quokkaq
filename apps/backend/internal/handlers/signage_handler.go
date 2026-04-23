package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// SignageHandler serves digital signage APIs.
type SignageHandler struct {
	svc      services.SignageService
	unitRepo unitRepository
}

// unitRepository is the subset of [repository.UnitRepository] needed for timezone alignment.
type unitRepository interface {
	FindByIDLight(id string) (*models.Unit, error)
}

// NewSignageHandler constructs the handler.
func NewSignageHandler(svc services.SignageService, unitRepo unitRepository) *SignageHandler {
	return &SignageHandler{svc: svc, unitRepo: unitRepo}
}

// CreatePlaylistRequest is the body for POST /units/{unitId}/playlists.
type CreatePlaylistRequest struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	IsDefault   bool                `json:"isDefault"`
	Items       []PlaylistItemInput `json:"items"`
}

// PlaylistItemInput is one material line in a playlist.
type PlaylistItemInput struct {
	MaterialID string  `json:"materialId"`
	Duration   int     `json:"duration"`
	ValidFrom  *string `json:"validFrom" example:"2025-12-24"` // YYYY-MM-DD, optional; inclusive
	ValidTo    *string `json:"validTo" example:"2025-12-31"`   // YYYY-MM-DD, optional; inclusive
}

// UpdatePlaylistRequest is the body for PUT /units/{unitId}/playlists/{playlistId}.
type UpdatePlaylistRequest = CreatePlaylistRequest

// ListPlaylists godoc
// @ID           ListSignagePlaylists
// @Summary      List playlists for a unit
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Success      200  {array}  models.Playlist
// @Failure      401  {string} string "Unauthorized"
// @Failure      403  {string} string "Forbidden"
// @Router       /units/{unitId}/playlists [get]
// @Security     BearerAuth
func (h *SignageHandler) ListPlaylists(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.ListPlaylists(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// GetPlaylist godoc
// @ID           GetSignagePlaylist
// @Summary      Get a playlist with items and material
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        playlistId path string true "Playlist ID"
// @Success      200  {object}  models.Playlist
// @Failure      404  {string} string "Not found"
// @Router       /units/{unitId}/playlists/{playlistId} [get]
// @Security     BearerAuth
func (h *SignageHandler) GetPlaylist(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	id := chi.URLParam(r, "playlistId")
	out, err := h.svc.GetPlaylist(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if out.UnitID != unitID {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, out)
}

// CreatePlaylist godoc
// @ID           CreateSignagePlaylist
// @Summary      Create a playlist
// @Tags         signage
// @Accept       json
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        body body CreatePlaylistRequest true "Playlist"
// @Success      201  {object}  models.Playlist
// @Router       /units/{unitId}/playlists [post]
// @Security     BearerAuth
func (h *SignageHandler) CreatePlaylist(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CreatePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	loc := h.unitTimeLocation(unitID)
	p := &models.Playlist{
		Name:        req.Name,
		Description: req.Description,
		IsDefault:   req.IsDefault,
	}
	items := make([]models.PlaylistItem, len(req.Items))
	for i := range req.Items {
		vf, vt, err := playlistItemDateFields(req.Items[i].ValidFrom, req.Items[i].ValidTo, loc)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		items[i] = models.PlaylistItem{MaterialID: req.Items[i].MaterialID, Duration: req.Items[i].Duration, ValidFrom: vf, ValidTo: vt}
	}
	if err := h.svc.CreatePlaylist(unitID, p, items); err != nil {
		if errors.Is(err, services.ErrDuplicateDefaultPlaylistName) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeSignageError(w, err)
		return
	}
	created, err := h.svc.GetPlaylist(p.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, created)
}

// UpdatePlaylist godoc
// @ID           UpdateSignagePlaylist
// @Summary      Replace a playlist and its items
// @Tags         signage
// @Accept       json
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        playlistId path string true "Playlist ID"
// @Param        body body UpdatePlaylistRequest true "Playlist"
// @Success      200  {object}  models.Playlist
// @Router       /units/{unitId}/playlists/{playlistId} [put]
// @Security     BearerAuth
func (h *SignageHandler) UpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	playlistID := chi.URLParam(r, "playlistId")
	var req UpdatePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	loc := h.unitTimeLocation(unitID)
	p := &models.Playlist{
		Name:        req.Name,
		Description: req.Description,
		IsDefault:   req.IsDefault,
	}
	items := make([]models.PlaylistItem, len(req.Items))
	for i := range req.Items {
		vf, vt, err := playlistItemDateFields(req.Items[i].ValidFrom, req.Items[i].ValidTo, loc)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		items[i] = models.PlaylistItem{MaterialID: req.Items[i].MaterialID, Duration: req.Items[i].Duration, ValidFrom: vf, ValidTo: vt}
	}
	if err := h.svc.UpdatePlaylist(unitID, playlistID, p, items); err != nil {
		if errors.Is(err, services.ErrDuplicateDefaultPlaylistName) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeSignageError(w, err)
		return
	}
	out, err := h.svc.GetPlaylist(playlistID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// DeletePlaylist godoc
// @ID           DeleteSignagePlaylist
// @Summary      Delete a playlist
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Param        playlistId path string true "Playlist ID"
// @Success      204
// @Router       /units/{unitId}/playlists/{playlistId} [delete]
// @Security     BearerAuth
func (h *SignageHandler) DeletePlaylist(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	playlistID := chi.URLParam(r, "playlistId")
	if err := h.svc.DeletePlaylist(unitID, playlistID); err != nil {
		writeSignageError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListSchedules godoc
// @ID           ListSignageSchedules
// @Summary      List playlist schedules
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Success      200  {array}  models.PlaylistSchedule
// @Router       /units/{unitId}/playlist-schedules [get]
// @Security     BearerAuth
func (h *SignageHandler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.ListSchedules(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// GetSchedule godoc
// @ID           GetSignageSchedule
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        scheduleId path string true "Schedule ID"
// @Success      200  {object}  models.PlaylistSchedule
// @Router       /units/{unitId}/playlist-schedules/{scheduleId} [get]
// @Security     BearerAuth
func (h *SignageHandler) GetSchedule(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	id := chi.URLParam(r, "scheduleId")
	out, err := h.svc.GetSchedule(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if out.UnitID != unitID {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, out)
}

// CreateScheduleRequest body.
type CreateScheduleRequest struct {
	PlaylistID string  `json:"playlistId"`
	DaysOfWeek string  `json:"daysOfWeek"`
	StartTime  string  `json:"startTime"`
	EndTime    string  `json:"endTime"`
	ValidFrom  *string `json:"validFrom" example:"2025-06-01"`
	ValidTo    *string `json:"validTo" example:"2025-08-31"`
	Priority   int     `json:"priority"`
	IsActive   bool    `json:"isActive"`
}

// CreateSchedule godoc
// @ID           CreateSignageSchedule
// @Tags         signage
// @Accept       json
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        body body CreateScheduleRequest true "Schedule"
// @Success      201  {object}  models.PlaylistSchedule
// @Router       /units/{unitId}/playlist-schedules [post]
// @Security     BearerAuth
func (h *SignageHandler) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CreateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	loc := h.unitTimeLocation(unitID)
	vf, vt, derr := playlistItemDateFields(req.ValidFrom, req.ValidTo, loc)
	if derr != nil {
		http.Error(w, derr.Error(), http.StatusBadRequest)
		return
	}
	s := &models.PlaylistSchedule{
		PlaylistID: req.PlaylistID,
		DaysOfWeek: req.DaysOfWeek,
		StartTime:  req.StartTime,
		EndTime:    req.EndTime,
		ValidFrom:  vf,
		ValidTo:    vt,
		Priority:   req.Priority,
		IsActive:   req.IsActive,
	}
	if s.StartTime == "" || s.EndTime == "" {
		http.Error(w, "startTime and endTime required", http.StatusBadRequest)
		return
	}
	if err := h.svc.CreateSchedule(unitID, s); err != nil {
		if errors.Is(err, services.ErrSignageScheduleOverlap) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if strings.HasPrefix(err.Error(), "startTime:") || strings.HasPrefix(err.Error(), "endTime:") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeSignageError(w, err)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, s)
}

// UpdateSchedule godoc
// @ID           UpdateSignageSchedule
// @Tags         signage
// @Accept       json
// @Param        unitId path string true "Unit ID"
// @Param        scheduleId path string true "Schedule ID"
// @Param        body body CreateScheduleRequest true "Schedule"
// @Success      200  {object}  models.PlaylistSchedule
// @Router       /units/{unitId}/playlist-schedules/{scheduleId} [put]
// @Security     BearerAuth
func (h *SignageHandler) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	sid := chi.URLParam(r, "scheduleId")
	existing, err := h.svc.GetSchedule(sid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if existing.UnitID != unitID {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	var req CreateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	loc := h.unitTimeLocation(unitID)
	vf, vt, derr := playlistItemDateFields(req.ValidFrom, req.ValidTo, loc)
	if derr != nil {
		http.Error(w, derr.Error(), http.StatusBadRequest)
		return
	}
	existing.PlaylistID = req.PlaylistID
	existing.DaysOfWeek = req.DaysOfWeek
	existing.StartTime = req.StartTime
	existing.EndTime = req.EndTime
	existing.ValidFrom = vf
	existing.ValidTo = vt
	existing.Priority = req.Priority
	existing.IsActive = req.IsActive
	if err := h.svc.UpdateSchedule(unitID, sid, existing); err != nil {
		if errors.Is(err, services.ErrSignageScheduleOverlap) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if strings.HasPrefix(err.Error(), "startTime:") || strings.HasPrefix(err.Error(), "endTime:") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeSignageError(w, err)
		return
	}
	out, err := h.svc.GetSchedule(sid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// DeleteSchedule godoc
// @ID           DeleteSignageSchedule
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Param        scheduleId path string true "Schedule ID"
// @Success      204
// @Router       /units/{unitId}/playlist-schedules/{scheduleId} [delete]
// @Security     BearerAuth
func (h *SignageHandler) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	sid := chi.URLParam(r, "scheduleId")
	if err := h.svc.DeleteSchedule(unitID, sid); err != nil {
		writeSignageError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ActivePlaylistPublic godoc
// @ID           GetActiveSignagePlaylist
// @Summary      Get the currently active playlist (public, for TV screen)
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Success      200  {object}  services.ActivePlaylistDTO
// @Router       /units/{unitId}/active-playlist [get]
func (h *SignageHandler) ActivePlaylistPublic(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.ActivePlaylist(r.Context(), unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// SignageHealth godoc
// @ID           GetSignageHealth
// @Summary      Digital signage health summary (admin)
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Success      200  {object}  services.SignageHealthDTO
// @Router       /units/{unitId}/signage-health [get]
// @Security     BearerAuth
func (h *SignageHandler) SignageHealth(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.SignageHealth(r.Context(), unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// ListFeeds godoc
// @ID           ListSignageFeeds
// @Tags         signage
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Success      200  {array}  models.ExternalFeed
// @Router       /units/{unitId}/feeds [get]
// @Security     BearerAuth
func (h *SignageHandler) ListFeeds(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.ListFeeds(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// CreateFeedRequest DTO.
type CreateFeedRequest struct {
	Name         string                 `json:"name"`
	Type         string                 `json:"type"`
	URL          string                 `json:"url"`
	PollInterval int                    `json:"pollInterval"`
	Config       map[string]interface{} `json:"config"`
	IsActive     bool                   `json:"isActive"`
}

// CreateFeed godoc
// @ID           CreateSignageFeed
// @Tags         signage
// @Accept       json
// @Param        unitId path string true "Unit ID"
// @Param        body body CreateFeedRequest true "Feed"
// @Success      201  {object}  models.ExternalFeed
// @Router       /units/{unitId}/feeds [post]
// @Security     BearerAuth
func (h *SignageHandler) CreateFeed(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CreateFeedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Type == "" {
		http.Error(w, "name and type required", http.StatusBadRequest)
		return
	}
	f := &models.ExternalFeed{
		Name:         req.Name,
		Type:         req.Type,
		URL:          req.URL,
		PollInterval: req.PollInterval,
		IsActive:     req.IsActive,
	}
	if req.Config != nil {
		b, mErr := json.Marshal(req.Config)
		if mErr != nil {
			http.Error(w, mErr.Error(), http.StatusBadRequest)
			return
		}
		f.Config = b
	}
	if err := h.svc.CreateFeed(unitID, f); err != nil {
		writeSignageError(w, err)
		return
	}
	created, gerr := h.svc.GetFeed(f.ID)
	if gerr != nil {
		slog.Error("GetFeed after CreateFeed", "feedId", f.ID, "err", gerr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, created)
}

// UpdateFeed godoc
// @ID           UpdateSignageFeed
// @Tags         signage
// @Accept       json
// @Param        unitId path string true "Unit ID"
// @Param        feedId path string true "Feed ID"
// @Param        body body CreateFeedRequest true "Feed"
// @Success      200  {object}  models.ExternalFeed
// @Router       /units/{unitId}/feeds/{feedId} [put]
// @Security     BearerAuth
func (h *SignageHandler) UpdateFeed(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	fid := chi.URLParam(r, "feedId")
	existing, err := h.svc.GetFeed(fid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if existing.UnitID != unitID {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	var req CreateFeedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	existing.Name = req.Name
	existing.Type = req.Type
	existing.URL = req.URL
	existing.PollInterval = req.PollInterval
	existing.IsActive = req.IsActive
	if req.Config != nil {
		b, mErr := json.Marshal(req.Config)
		if mErr != nil {
			http.Error(w, mErr.Error(), http.StatusBadRequest)
			return
		}
		existing.Config = b
	} else {
		existing.Config = nil
	}
	if err := h.svc.UpdateFeed(unitID, fid, existing); err != nil {
		writeSignageError(w, err)
		return
	}
	out, gerr := h.svc.GetFeed(fid)
	if gerr != nil {
		slog.Error("GetFeed after UpdateFeed", "feedId", fid, "err", gerr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// DeleteFeed godoc
// @ID           DeleteSignageFeed
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Param        feedId path string true "Feed ID"
// @Success      204
// @Router       /units/{unitId}/feeds/{feedId} [delete]
// @Security     BearerAuth
func (h *SignageHandler) DeleteFeed(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	fid := chi.URLParam(r, "feedId")
	if err := h.svc.DeleteFeed(unitID, fid); err != nil {
		writeSignageError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PublicFeedData godoc
// @ID           GetSignageFeedDataPublic
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Param        feedId path string true "Feed ID"
// @Success      200
// @Router       /units/{unitId}/feeds/{feedId}/data [get]
func (h *SignageHandler) PublicFeedData(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	fid := chi.URLParam(r, "feedId")
	b, err := h.svc.PublicFeedData(unitID, fid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// #nosec G705 -- CachedData is validated as JSON during feed polling (json.Unmarshal)
	_, _ = w.Write(b)
}

// ListAnnouncements godoc
// @ID           ListSignageAnnouncements
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Success      200  {array}  models.ScreenAnnouncement
// @Router       /units/{unitId}/screen-announcements [get]
// @Security     BearerAuth
func (h *SignageHandler) ListAnnouncements(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.ListAnnouncements(unitID, true)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// ListAnnouncementsPublic godoc
// @ID           ListSignageAnnouncementsPublic
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Success      200  {array}  models.ScreenAnnouncement
// @Router       /units/{unitId}/public-screen-announcements [get]
func (h *SignageHandler) ListAnnouncementsPublic(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	out, err := h.svc.PublicAnnouncements(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// AnnouncementRequest DTO.
type AnnouncementRequest struct {
	Text        string  `json:"text"`
	Priority    int     `json:"priority"`
	Style       string  `json:"style"`
	DisplayMode string  `json:"displayMode" enums:"banner,fullscreen"`
	StartsAt    *string `json:"startsAt"`
	ExpiresAt   *string `json:"expiresAt"`
	IsActive    bool    `json:"isActive"`
}

// CreateAnnouncement godoc
// @ID           CreateSignageAnnouncement
// @Tags         signage
// @Accept       json
// @Param        unitId path string true "Unit ID"
// @Param        body body AnnouncementRequest true "Announcement"
// @Success      201  {object}  models.ScreenAnnouncement
// @Router       /units/{unitId}/screen-announcements [post]
// @Security     BearerAuth
func (h *SignageHandler) CreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req AnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Text == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}
	a := &models.ScreenAnnouncement{
		Text:     req.Text,
		Priority: req.Priority,
		Style:    req.Style,
		IsActive: req.IsActive,
	}
	if req.DisplayMode == "" {
		a.DisplayMode = "banner"
	} else {
		if req.DisplayMode != "banner" && req.DisplayMode != "fullscreen" {
			http.Error(w, "displayMode must be banner or fullscreen", http.StatusBadRequest)
			return
		}
		a.DisplayMode = req.DisplayMode
	}
	if req.Style == "" {
		a.Style = "info"
	}
	if req.StartsAt != nil && *req.StartsAt != "" {
		t, err := time.Parse(time.RFC3339, *req.StartsAt)
		if err != nil {
			http.Error(w, "startsAt: invalid time (use RFC3339)", http.StatusBadRequest)
			return
		}
		a.StartsAt = &t
	}
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			http.Error(w, "expiresAt: invalid time (use RFC3339)", http.StatusBadRequest)
			return
		}
		a.ExpiresAt = &t
	}
	if err := h.svc.CreateAnnouncement(unitID, a); err != nil {
		writeSignageError(w, err)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, a)
}

// UpdateAnnouncement godoc
// @ID           UpdateSignageAnnouncement
// @Tags         signage
// @Accept       json
// @Param        unitId path string true "Unit ID"
// @Param        annId path string true "Announcement ID"
// @Param        body body AnnouncementRequest true "Announcement"
// @Success      200  {object}  models.ScreenAnnouncement
// @Router       /units/{unitId}/screen-announcements/{annId} [put]
// @Security     BearerAuth
func (h *SignageHandler) UpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	annID := chi.URLParam(r, "annId")
	var req AnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a := &models.ScreenAnnouncement{
		ID:       annID,
		UnitID:   unitID,
		Text:     req.Text,
		Priority: req.Priority,
		Style:    req.Style,
		IsActive: req.IsActive,
	}
	if req.DisplayMode == "" {
		a.DisplayMode = "banner"
	} else {
		if req.DisplayMode != "banner" && req.DisplayMode != "fullscreen" {
			http.Error(w, "displayMode must be banner or fullscreen", http.StatusBadRequest)
			return
		}
		a.DisplayMode = req.DisplayMode
	}
	if a.Style == "" {
		a.Style = "info"
	}
	if req.StartsAt != nil && *req.StartsAt != "" {
		t, err := time.Parse(time.RFC3339, *req.StartsAt)
		if err != nil {
			http.Error(w, "startsAt: invalid time", http.StatusBadRequest)
			return
		}
		a.StartsAt = &t
	} else {
		a.StartsAt = nil
	}
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			http.Error(w, "expiresAt: invalid time", http.StatusBadRequest)
			return
		}
		a.ExpiresAt = &t
	} else {
		a.ExpiresAt = nil
	}
	if err := h.svc.UpdateAnnouncement(unitID, annID, a); err != nil {
		writeSignageError(w, err)
		return
	}
	out, err := h.svc.GetAnnouncement(annID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// DeleteAnnouncement godoc
// @ID           DeleteSignageAnnouncement
// @Tags         signage
// @Param        unitId path string true "Unit ID"
// @Param        annId path string true "Announcement ID"
// @Success      204
// @Router       /units/{unitId}/screen-announcements/{annId} [delete]
// @Security     BearerAuth
func (h *SignageHandler) DeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	annID := chi.URLParam(r, "annId")
	if err := h.svc.DeleteAnnouncement(unitID, annID); err != nil {
		writeSignageError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// unitTimeLocation returns the IANA location for a unit, or UTC if unknown.
func (h *SignageHandler) unitTimeLocation(unitID string) *time.Location {
	if h.unitRepo == nil {
		return time.UTC
	}
	u, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil {
		return time.UTC
	}
	tz := strings.TrimSpace(u.Timezone)
	if tz == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

func writeSignageError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, services.ErrDuplicateDefaultPlaylistName) {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	if errors.Is(err, services.ErrSignageScheduleOverlap) {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func parseOptDateYMD(s *string, loc *time.Location) (*time.Time, error) {
	if s == nil {
		return nil, nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil, nil
	}
	if loc == nil {
		loc = time.UTC
	}
	parsed, err := time.ParseInLocation("2006-01-02", t, loc)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

// playlistItemDateFields parses optional YYYY-MM-DD bounds in the unit’s timezone. Used for both playlist item and schedule.
func playlistItemDateFields(from, to *string, loc *time.Location) (vf, vt *time.Time, err error) {
	vf, err = parseOptDateYMD(from, loc)
	if err != nil {
		return nil, nil, errors.New("validFrom: use YYYY-MM-DD")
	}
	vt, err = parseOptDateYMD(to, loc)
	if err != nil {
		return nil, nil, errors.New("validTo: use YYYY-MM-DD")
	}
	if vf != nil && vt != nil && vf.After(*vt) {
		return nil, nil, errors.New("validFrom must be on or before validTo")
	}
	return vf, vt, nil
}
