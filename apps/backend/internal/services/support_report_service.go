package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

const supportReportSyncMinInterval = 2 * time.Minute

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

// Create persists a report and creates the Plane work item.
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

	row := &models.SupportReport{
		ID:              uuid.New().String(),
		CreatedByUserID: userID,
		Title:           title,
		TraceID:         strings.TrimSpace(in.TraceID),
		Diagnostics:     in.Diagnostics,
		UnitID:          in.UnitID,
	}

	html := BuildSupportDescriptionHTML(desc, in.Diagnostics, row.TraceID)
	planeID, seq, stateName, err := s.plane.CreateWorkItem(ctx, row.ID, title, html)
	if err != nil {
		return nil, err
	}
	row.PlaneWorkItemID = planeID
	row.PlaneSequenceID = seq
	row.PlaneStatus = stateName
	now := time.Now().UTC()
	row.LastSyncedAt = &now

	if err := s.repo.Create(row); err != nil {
		return nil, err
	}
	return row, nil
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
	for i := range rows {
		if rows[i].PlaneWorkItemID == "" {
			continue
		}
		if rows[i].LastSyncedAt != nil && now.Sub(*rows[i].LastSyncedAt) < supportReportSyncMinInterval {
			continue
		}
		seq, st, err := s.plane.GetWorkItem(ctx, rows[i].PlaneWorkItemID)
		if err != nil {
			continue
		}
		if seq != nil {
			rows[i].PlaneSequenceID = seq
		}
		rows[i].PlaneStatus = st
		rows[i].LastSyncedAt = &now
		_ = s.repo.Update(&rows[i])
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
		seq, st, err := s.plane.GetWorkItem(ctx, row.PlaneWorkItemID)
		if err == nil {
			if seq != nil {
				row.PlaneSequenceID = seq
			}
			row.PlaneStatus = st
			now := time.Now().UTC()
			row.LastSyncedAt = &now
			_ = s.repo.Update(row)
		}
	}
	return row, nil
}

// Errors for support reports.
var (
	ErrPlaneNotConfigured              = errors.New("plane integration is not configured")
	ErrSupportReportInvalidTitle       = errors.New("invalid title")
	ErrSupportReportInvalidDescription = errors.New("invalid description")
	ErrSupportReportForbidden          = errors.New("forbidden")
)
