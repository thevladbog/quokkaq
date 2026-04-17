package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

const supportReportSyncMinInterval = 2 * time.Minute

const maxPlaneRefreshPerList = 10

const planeGetWorkItemTimeout = 8 * time.Second

// SupportReportService creates support reports and syncs status from Plane.
type SupportReportService struct {
	repo     repository.SupportReportRepository
	plane    *PlaneClient
	userRepo repository.UserRepository
}

// NewSupportReportService constructs SupportReportService.
func NewSupportReportService(repo repository.SupportReportRepository, plane *PlaneClient, userRepo repository.UserRepository) *SupportReportService {
	return &SupportReportService{repo: repo, plane: plane, userRepo: userRepo}
}

// CreateReportInput is validated user input for a new report.
type CreateReportInput struct {
	Title       string
	Description string
	TraceID     string
	Diagnostics json.RawMessage
	UnitID      *string
}

// Create persists a report: insert a pending row first, then Plane work item, then update with Plane fields.
func (s *SupportReportService) Create(ctx context.Context, userID string, in CreateReportInput) (*models.SupportReport, error) {
	if s.plane == nil || !s.plane.Enabled() {
		return nil, ErrPlaneNotConfigured
	}
	title := strings.TrimSpace(in.Title)
	if title == "" || len(title) > 500 {
		return nil, ErrSupportReportInvalidTitle
	}
	desc := strings.TrimSpace(in.Description)
	if desc == "" || len(desc) > 20000 {
		return nil, ErrSupportReportInvalidDescription
	}

	unitID, err := s.resolveUnitIDForCreate(userID, in.UnitID)
	if err != nil {
		return nil, err
	}

	var diagPtr *json.RawMessage
	if len(in.Diagnostics) > 0 {
		raw := json.RawMessage(append(json.RawMessage(nil), in.Diagnostics...))
		diagPtr = &raw
	}

	row := &models.SupportReport{
		ID:              uuid.New().String(),
		CreatedByUserID: userID,
		Title:           title,
		TraceID:         strings.TrimSpace(in.TraceID),
		Diagnostics:     diagPtr,
		UnitID:          unitID,
		PlaneWorkItemID: "",
	}

	if err := s.repo.Create(row); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}

	html := BuildSupportDescriptionHTML(desc, in.Diagnostics, row.TraceID)
	planeID, seq, stateName, err := s.plane.CreateWorkItem(ctx, row.ID, title, html)
	if err != nil {
		log.Printf("support report: Plane CreateWorkItem failed after DB insert id=%s: %v", row.ID, err)
		return nil, err
	}
	row.PlaneWorkItemID = planeID
	row.PlaneSequenceID = seq
	row.PlaneStatus = stateName
	now := time.Now().UTC()
	row.LastSyncedAt = &now

	if err := s.repo.Update(row); err != nil {
		log.Printf("support report: DB update after Plane success (possible orphan work item in Plane) id=%s planeWorkItemID=%s: %v", row.ID, planeID, err)
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}
	return row, nil
}

func (s *SupportReportService) resolveUnitIDForCreate(userID string, unitID *string) (*string, error) {
	if unitID == nil {
		return nil, nil
	}
	u := strings.TrimSpace(*unitID)
	if u == "" {
		return nil, nil
	}
	ok, err := s.userRepo.IsAdminOrHasUnitAccess(userID, u)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrSupportReportInvalidUnit
	}
	return &u, nil
}

// List returns reports visible to the user (all if admin).
func (s *SupportReportService) List(ctx context.Context, userID string) ([]models.SupportReport, error) {
	isAdmin, err := s.userRepo.IsAdmin(userID)
	if err != nil {
		return nil, err
	}
	rows, err := s.repo.ListForUser(userID, isAdmin)
	if err != nil {
		return nil, err
	}
	if s.plane == nil || !s.plane.Enabled() {
		return rows, nil
	}
	now := time.Now().UTC()
	type cand struct {
		idx int
		ts  time.Time
	}
	var candidates []cand
	for i := range rows {
		if rows[i].PlaneWorkItemID == "" {
			continue
		}
		if rows[i].LastSyncedAt != nil && now.Sub(*rows[i].LastSyncedAt) < supportReportSyncMinInterval {
			continue
		}
		var ts time.Time
		if rows[i].LastSyncedAt != nil {
			ts = *rows[i].LastSyncedAt
		}
		candidates = append(candidates, cand{i, ts})
	}
	sort.Slice(candidates, func(a, b int) bool {
		return candidates[a].ts.Before(candidates[b].ts)
	})
	if len(candidates) > maxPlaneRefreshPerList {
		candidates = candidates[:maxPlaneRefreshPerList]
	}
	for _, c := range candidates {
		i := c.idx
		syncCtx, cancel := context.WithTimeout(ctx, planeGetWorkItemTimeout)
		seq, st, err := s.plane.GetWorkItem(syncCtx, rows[i].PlaneWorkItemID)
		cancel()
		if err != nil {
			log.Printf("support report: List sync GetWorkItem id=%s planeWorkItemID=%s: %v", rows[i].ID, rows[i].PlaneWorkItemID, err)
			continue
		}
		if seq != nil {
			rows[i].PlaneSequenceID = seq
		}
		rows[i].PlaneStatus = st
		rows[i].LastSyncedAt = &now
		if err := s.repo.Update(&rows[i]); err != nil {
			log.Printf("support report: List sync: update id=%s: %v", rows[i].ID, err)
		}
	}
	return rows, nil
}

// GetByID returns one report if the user is the author or an admin. Refreshes status from Plane when configured.
func (s *SupportReportService) GetByID(ctx context.Context, userID, reportID string) (*models.SupportReport, error) {
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	isAdmin, err := s.userRepo.IsAdmin(userID)
	if err != nil {
		return nil, err
	}
	if row.CreatedByUserID != userID && !isAdmin {
		return nil, ErrSupportReportForbidden
	}
	if s.plane != nil && s.plane.Enabled() && row.PlaneWorkItemID != "" {
		syncCtx, cancel := context.WithTimeout(ctx, planeGetWorkItemTimeout)
		seq, st, err := s.plane.GetWorkItem(syncCtx, row.PlaneWorkItemID)
		cancel()
		if err != nil {
			log.Printf("support report: GetByID sync GetWorkItem id=%s planeWorkItemID=%s: %v", row.ID, row.PlaneWorkItemID, err)
		} else {
			if seq != nil {
				row.PlaneSequenceID = seq
			}
			row.PlaneStatus = st
			now := time.Now().UTC()
			row.LastSyncedAt = &now
			if err := s.repo.Update(row); err != nil {
				log.Printf("support report: GetByID sync: update id=%s: %v", row.ID, err)
			}
		}
	}
	return row, nil
}

// Errors for support reports.
var (
	ErrPlaneNotConfigured              = errors.New("plane integration is not configured")
	ErrSupportReportInvalidTitle       = errors.New("invalid title")
	ErrSupportReportInvalidDescription = errors.New("invalid description")
	ErrSupportReportInvalidUnit        = errors.New("invalid unit")
	ErrSupportReportForbidden          = errors.New("forbidden")
	// ErrSupportReportPersistence wraps DB errors after Plane calls (possible orphan work item in Plane).
	ErrSupportReportPersistence = errors.New("support report persistence failed")
)
