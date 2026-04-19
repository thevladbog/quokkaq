package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/logger"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"gorm.io/gorm"
)

const supportReportSyncMinInterval = 2 * time.Minute

const maxTicketRefreshPerList = 10

const maxConcurrentTicketListRefresh = 4

const ticketGetWorkItemTimeout = 8 * time.Second

// supportReportOrphanCreated counts rows where an external ticket was created but persisting plane_work_item_id to DB failed.
var supportReportOrphanCreated atomic.Int64

// SupportReportTicketClient is the external ticket system used for support reports (Plane or Yandex Tracker).
type SupportReportTicketClient interface {
	Enabled() bool
	CreateWorkItem(ctx context.Context, externalID, title, descriptionPayload string, extras SupportReportTicketCreateExtras) (workItemID string, sequenceID *int, stateName string, err error)
	GetWorkItem(ctx context.Context, workItemID string) (sequenceID *int, stateName string, err error)
	AddComment(ctx context.Context, workItemID, text string) error
}

// SupportReportPlaneClient is a legacy alias for SupportReportTicketClient.
type SupportReportPlaneClient = SupportReportTicketClient

// SupportReportService creates support reports and syncs status from the configured ticket backend.
type SupportReportService struct {
	repo               repository.SupportReportRepository
	shareRepo          repository.SupportReportShareRepository
	plane              SupportReportTicketClient
	tracker            SupportReportTicketClient
	deploymentSettings repository.DeploymentSaaSSettingsRepository
	createPlatform     string
	userRepo           repository.UserRepository
	companyRepo        repository.CompanyRepository
	// cancelComment is SUPPORT_REPORT_CANCEL_COMMENT (trimmed) or the default applicant-facing Russian line.
	cancelComment string
}

// supportReportTrackerAccessPatcher is implemented by backends that sync Tracker-only fields (e.g. apiAccessToTheTicket).
type supportReportTrackerAccessPatcher interface {
	PatchIssueAPIAccessToTicket(ctx context.Context, issueKey, csv string) error
}

// NewSupportReportService constructs SupportReportService.
// createPlatform is models.TicketBackendPlane, models.TicketBackendYandexTracker, or SupportReportPlatformNone.
// companyRepo may be nil (Yandex Tracker company field on create will be left empty).
// deploymentSettings may be nil (tests); when set, support ticket queue/type can be read from DB with env fallback.
func NewSupportReportService(repo repository.SupportReportRepository, shareRepo repository.SupportReportShareRepository, plane, tracker SupportReportTicketClient, deploymentSettings repository.DeploymentSaaSSettingsRepository, createPlatform string, userRepo repository.UserRepository, companyRepo repository.CompanyRepository) *SupportReportService {
	cc := strings.TrimSpace(os.Getenv("SUPPORT_REPORT_CANCEL_COMMENT"))
	if cc == "" {
		cc = "Спасибо, что написали нам. Это обращение закрыто в QuokkaQ. Если снова понадобится помощь — обращайтесь, мы на связи."
	}
	return &SupportReportService{
		repo:               repo,
		shareRepo:          shareRepo,
		plane:              plane,
		tracker:            tracker,
		deploymentSettings: deploymentSettings,
		createPlatform:     createPlatform,
		userRepo:           userRepo,
		companyRepo:        companyRepo,
		cancelComment:      cc,
	}
}

func normalizeTicketBackend(backend string) string {
	b := strings.TrimSpace(backend)
	if b == "" {
		return models.TicketBackendPlane
	}
	return b
}

// filterRowsForConfiguredPlatform keeps only rows whose ticket_backend matches SUPPORT_REPORT_PLATFORM
// when it is plane or yandex_tracker, so legacy rows from another backend are hidden after switching integrations.
func (s *SupportReportService) filterRowsForConfiguredPlatform(rows []models.SupportReport) []models.SupportReport {
	if s.createPlatform != models.TicketBackendPlane && s.createPlatform != models.TicketBackendYandexTracker {
		return rows
	}
	out := make([]models.SupportReport, 0, len(rows))
	for i := range rows {
		if normalizeTicketBackend(rows[i].TicketBackend) == s.createPlatform {
			out = append(out, rows[i])
		}
	}
	return out
}

func (s *SupportReportService) reportMatchesConfiguredPlatform(row *models.SupportReport) bool {
	if s.createPlatform != models.TicketBackendPlane && s.createPlatform != models.TicketBackendYandexTracker {
		return true
	}
	return normalizeTicketBackend(row.TicketBackend) == s.createPlatform
}

func (s *SupportReportService) yandexTrackerUsableForSupport() bool {
	if s.tracker == nil {
		return false
	}
	yt, ok := s.tracker.(*YandexTrackerClient)
	if !ok {
		return false
	}
	if !yt.CredentialsReady() {
		return false
	}
	if s.deploymentSettings != nil {
		st, err := s.deploymentSettings.Get()
		if err != nil {
			return false
		}
		if ResolveSupportTrackerQueue(st) != "" {
			return true
		}
	}
	return yt.Enabled()
}

func (s *SupportReportService) clientForBackend(backend string) SupportReportTicketClient {
	switch normalizeTicketBackend(backend) {
	case models.TicketBackendYandexTracker:
		if s.yandexTrackerUsableForSupport() {
			return s.tracker
		}
	case models.TicketBackendPlane:
		if s.plane != nil && s.plane.Enabled() {
			return s.plane
		}
	}
	return nil
}

func (s *SupportReportService) activeCreateClient() SupportReportTicketClient {
	switch s.createPlatform {
	case models.TicketBackendYandexTracker:
		return s.clientForBackend(models.TicketBackendYandexTracker)
	case models.TicketBackendPlane:
		return s.clientForBackend(models.TicketBackendPlane)
	default:
		return nil
	}
}

// CreateReportInput is validated user input for a new report.
type CreateReportInput struct {
	Title       string
	Description string
	TraceID     string
	Diagnostics json.RawMessage
	UnitID      *string
}

// Create persists a report: insert a pending row first, then external ticket, then update with ticket fields.
func (s *SupportReportService) Create(ctx context.Context, userID string, in CreateReportInput) (*models.SupportReport, error) {
	client := s.activeCreateClient()
	if client == nil {
		return nil, ErrSupportTicketIntegrationNotConfigured
	}
	if s.createPlatform != models.TicketBackendPlane && s.createPlatform != models.TicketBackendYandexTracker {
		return nil, ErrSupportTicketIntegrationNotConfigured
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
		TicketBackend:   s.createPlatform,
		Title:           title,
		Description:     desc,
		TraceID:         strings.TrimSpace(in.TraceID),
		Diagnostics:     diagPtr,
		UnitID:          unitID,
		PlaneWorkItemID: "",
	}

	if err := s.repo.Create(row); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}

	var descPayload string
	switch s.createPlatform {
	case models.TicketBackendYandexTracker:
		descPayload = BuildSupportDescriptionMarkdown(desc, in.Diagnostics, row.TraceID)
	default:
		descPayload = BuildSupportDescriptionHTML(desc, in.Diagnostics, row.TraceID)
	}
	extras := SupportReportTicketCreateExtras{}
	if s.createPlatform == models.TicketBackendYandexTracker {
		var errAccess error
		extras.ApiAccessToTicket, errAccess = s.supportReportAPIAccessorUserIDsCSVForReport(row)
		if errAccess != nil {
			return nil, errAccess
		}
		if u, err := s.userRepo.FindByID(ctx, userID); err == nil && u != nil && u.Email != nil {
			extras.ApplicantsEmail = strings.TrimSpace(*u.Email)
		}
		extras.CompanyTrackerLabel = strings.TrimSpace(s.buildTrackerCompanyLabel(userID))
	}
	var extID string
	var seq *int
	var stateName string
	if s.createPlatform == models.TicketBackendYandexTracker {
		yt, ok := client.(*YandexTrackerClient)
		if !ok {
			return nil, fmt.Errorf("support report: internal: expected Yandex Tracker client")
		}
		var st *models.DeploymentSaaSSettings
		if s.deploymentSettings != nil {
			var getErr error
			st, getErr = s.deploymentSettings.Get()
			if getErr != nil {
				return nil, fmt.Errorf("%w: deployment settings: %v", ErrSupportReportPersistence, getErr)
			}
		}
		queue := ResolveSupportTrackerQueue(st)
		typeRaw := ""
		if st != nil {
			typeRaw = strings.TrimSpace(st.TrackerTypeSupport)
		}
		opts := YandexTrackerIssueCreateOpts{QueueKey: queue, TypeRaw: typeRaw}
		extID, seq, stateName, err = yt.CreateWorkItemWithOpts(ctx, row.ID, title, descPayload, extras, opts)
	} else {
		extID, seq, stateName, err = client.CreateWorkItem(ctx, row.ID, title, descPayload, extras)
	}
	if err != nil {
		logger.Printf("support report: CreateWorkItem failed after DB insert id=%s: %v", row.ID, err)
		if delErr := s.repo.DeleteByID(row.ID); delErr != nil {
			logger.Printf("support report: cleanup DeleteByID after ticket failure id=%s: %v", row.ID, delErr)
		}
		return nil, err
	}
	row.PlaneWorkItemID = extID
	row.PlaneSequenceID = seq
	row.PlaneStatus = stateName
	now := time.Now().UTC()
	row.LastSyncedAt = &now

	if err := s.repo.Update(row); err != nil {
		n := supportReportOrphanCreated.Add(1)
		logger.Printf("metric support_report_orphan_created=%d: DB update after external ticket success failed id=%s externalId=%s: %v", n, row.ID, extID, err)
		if delErr := s.repo.DeleteByID(row.ID); delErr != nil {
			logger.Printf("support report: orphan cleanup DeleteByID id=%s: %v", row.ID, delErr)
		} else {
			logger.Printf("support report: orphan cleanup removed local row id=%s; external ticket %s was left in the external system (no delete policy)", row.ID, extID)
		}
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}
	return row, nil
}

// supportReportAPIAccessorUserIDsCSV lists QuokkaQ user ids who may read this support report via the API:
// the author, tenant system_admin users and the company owner in the author's company, and platform_admin users
// (SaaS operators). Global role "admin" is not included — it is not tenant-scoped.
func (s *SupportReportService) supportReportAPIAccessorUserIDsCSV(authorUserID string) (string, error) {
	authorUserID = strings.TrimSpace(authorUserID)
	if authorUserID == "" {
		return "", fmt.Errorf("support report: empty author user id")
	}
	companyID, err := s.userRepo.GetCompanyIDByUserID(authorUserID)
	if err != nil {
		return "", fmt.Errorf("support report: author company: %w", err)
	}
	companyID = strings.TrimSpace(companyID)
	if companyID == "" {
		return "", fmt.Errorf("support report: author has no company")
	}
	tenantAdmins, err := s.userRepo.ListUserIDsWithTenantSystemAdminInCompany(companyID)
	if err != nil {
		return "", fmt.Errorf("support report: list tenant system admins: %w", err)
	}
	platformAdmins, err := s.userRepo.ListUserIDsByRoleNames([]string{"platform_admin"})
	if err != nil {
		return "", fmt.Errorf("support report: list platform admins: %w", err)
	}
	seen := make(map[string]struct{})
	var out []string
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	add(authorUserID)
	for _, id := range tenantAdmins {
		add(id)
	}
	for _, id := range platformAdmins {
		add(id)
	}
	if s.companyRepo != nil {
		comp, err := s.companyRepo.FindByID(companyID)
		if err == nil && comp != nil {
			if oid := strings.TrimSpace(comp.OwnerUserID); oid != "" {
				add(oid)
			}
		}
	}
	return strings.Join(out, ","), nil
}

// supportReportAPIAccessorUserIDsCSVForReport is author + tenant admins + every user id granted a local share row.
func (s *SupportReportService) supportReportAPIAccessorUserIDsCSVForReport(report *models.SupportReport) (string, error) {
	if report == nil {
		return "", fmt.Errorf("support report: nil row")
	}
	base, err := s.supportReportAPIAccessorUserIDsCSV(report.CreatedByUserID)
	if err != nil {
		return "", err
	}
	if s.shareRepo == nil {
		return base, nil
	}
	shares, err := s.shareRepo.ListByReportID(report.ID)
	if err != nil {
		return "", err
	}
	if len(shares) == 0 {
		return base, nil
	}
	seen := make(map[string]struct{})
	var out []string
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	for _, part := range strings.Split(base, ",") {
		add(part)
	}
	for i := range shares {
		add(shares[i].SharedWithUserID)
	}
	return strings.Join(out, ","), nil
}

func (s *SupportReportService) syncYandexAPIAccessToTicket(ctx context.Context, row *models.SupportReport) error {
	if err := s.requireYandexTrackerShares(row); err != nil {
		return err
	}
	ext := strings.TrimSpace(row.PlaneWorkItemID)
	if ext == "" {
		return nil
	}
	if s.tracker == nil || !s.tracker.Enabled() {
		return nil
	}
	patcher, ok := s.tracker.(supportReportTrackerAccessPatcher)
	if !ok || patcher == nil {
		return nil
	}
	csv, err := s.supportReportAPIAccessorUserIDsCSVForReport(row)
	if err != nil {
		return err
	}
	return patcher.PatchIssueAPIAccessToTicket(ctx, ext, csv)
}

func (s *SupportReportService) yandexTrackerReportGate(row *models.SupportReport, errNonYandex error) error {
	if row == nil {
		return gorm.ErrRecordNotFound
	}
	if !s.reportMatchesConfiguredPlatform(row) {
		return gorm.ErrRecordNotFound
	}
	if normalizeTicketBackend(row.TicketBackend) != models.TicketBackendYandexTracker {
		return errNonYandex
	}
	return nil
}

func (s *SupportReportService) requireYandexTrackerShares(row *models.SupportReport) error {
	return s.yandexTrackerReportGate(row, ErrSupportReportSharesYandexOnly)
}

func (s *SupportReportService) requireYandexComments(row *models.SupportReport) error {
	return s.yandexTrackerReportGate(row, ErrSupportReportCommentsYandexOnly)
}

func (s *SupportReportService) canManageSupportReportShares(viewerID string, row *models.SupportReport) (bool, error) {
	return s.supportReportManagerAccess(viewerID, row)
}

// SupportReportShareListItem is one persisted share row for API responses.
type SupportReportShareListItem struct {
	UserID          string    `json:"userId"`
	GrantedByUserID string    `json:"grantedByUserId"`
	CreatedAt       time.Time `json:"createdAt" swaggertype:"string" format:"date-time"`
	DisplayName     string    `json:"displayName,omitempty"`
}

// ListSupportReportShareCandidates returns users in the report author's company who may receive a share (Yandex-only reports).
func (s *SupportReportService) ListSupportReportShareCandidates(ctx context.Context, viewerID, reportID, q string) ([]repository.SupportReportShareCandidate, error) {
	_ = ctx
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	okManage, err := s.canManageSupportReportShares(viewerID, row)
	if err != nil {
		return nil, err
	}
	if !okManage {
		return nil, ErrSupportReportForbidden
	}
	if err := s.requireYandexTrackerShares(row); err != nil {
		return nil, err
	}
	companyID, err := s.userRepo.GetCompanyIDByUserID(row.CreatedByUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []repository.SupportReportShareCandidate{}, nil
		}
		return nil, err
	}
	return s.userRepo.ListSupportReportShareCandidates(companyID, reportID, row.CreatedByUserID, q, 50)
}

// ListSupportReportShares lists share rows for a report (author or tenant admin; Yandex-only).
func (s *SupportReportService) ListSupportReportShares(ctx context.Context, viewerID, reportID string) ([]SupportReportShareListItem, error) {
	_ = ctx
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	okManage, err := s.canManageSupportReportShares(viewerID, row)
	if err != nil {
		return nil, err
	}
	if !okManage {
		return nil, ErrSupportReportForbidden
	}
	if err := s.requireYandexTrackerShares(row); err != nil {
		return nil, err
	}
	if s.shareRepo == nil {
		return nil, nil
	}
	shares, err := s.shareRepo.ListByReportID(reportID)
	if err != nil {
		return nil, err
	}
	if len(shares) == 0 {
		return []SupportReportShareListItem{}, nil
	}
	ids := make([]string, 0, len(shares)*2)
	for i := range shares {
		ids = append(ids, shares[i].SharedWithUserID, shares[i].GrantedByUserID)
	}
	names, err := s.userRepo.ResolveJournalActorDisplayNames(ids)
	if err != nil {
		return nil, err
	}
	out := make([]SupportReportShareListItem, 0, len(shares))
	for i := range shares {
		sh := shares[i]
		out = append(out, SupportReportShareListItem{
			UserID:          sh.SharedWithUserID,
			GrantedByUserID: sh.GrantedByUserID,
			CreatedAt:       sh.CreatedAt,
			DisplayName:     names[sh.SharedWithUserID],
		})
	}
	return out, nil
}

// AddSupportReportShare grants read access to targetUserID (same company, support roles). Syncs Tracker apiAccessToTheTicket.
func (s *SupportReportService) AddSupportReportShare(ctx context.Context, viewerID, reportID, targetUserID string) ([]SupportReportShareListItem, error) {
	targetUserID = strings.TrimSpace(targetUserID)
	if targetUserID == "" {
		return nil, ErrSupportReportShareInvalidTarget
	}
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	okManage, err := s.canManageSupportReportShares(viewerID, row)
	if err != nil {
		return nil, err
	}
	if !okManage {
		return nil, ErrSupportReportForbidden
	}
	if err := s.requireYandexTrackerShares(row); err != nil {
		return nil, err
	}
	if targetUserID == row.CreatedByUserID {
		return nil, ErrSupportReportShareSelf
	}
	okAccess, err := s.userRepo.HasSupportReportAccess(targetUserID)
	if err != nil {
		return nil, err
	}
	if !okAccess {
		return nil, ErrSupportReportShareInvalidTarget
	}
	authorCompany, err := s.userRepo.GetCompanyIDByUserID(row.CreatedByUserID)
	if err != nil {
		return nil, err
	}
	okCo, err := s.userRepo.HasCompanyAccess(targetUserID, authorCompany)
	if err != nil {
		return nil, err
	}
	if !okCo {
		return nil, ErrSupportReportShareInvalidTarget
	}
	if s.shareRepo == nil {
		return nil, ErrSupportReportPersistence
	}
	if exists, err := s.shareRepo.Exists(reportID, targetUserID); err != nil {
		return nil, err
	} else if exists {
		return s.ListSupportReportShares(ctx, viewerID, reportID)
	}
	shareRow := &models.SupportReportShare{
		SupportReportID:  reportID,
		SharedWithUserID: targetUserID,
		GrantedByUserID:  viewerID,
	}
	if err := s.shareRepo.Create(shareRow); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return s.ListSupportReportShares(ctx, viewerID, reportID)
		}
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}
	if err := s.syncYandexAPIAccessToTicket(ctx, row); err != nil {
		if rbErr := s.shareRepo.DeleteByReportAndUser(reportID, targetUserID); rbErr != nil {
			logger.Printf("ERROR support report: rollback share after Tracker sync failed reportID=%s targetUserID=%s rollbackErr=%v syncErr=%v", reportID, targetUserID, rbErr, err)
		}
		return nil, err
	}
	return s.ListSupportReportShares(ctx, viewerID, reportID)
}

// RemoveSupportReportShare revokes a share and syncs Tracker apiAccessToTheTicket.
func (s *SupportReportService) RemoveSupportReportShare(ctx context.Context, viewerID, reportID, sharedWithUserID string) ([]SupportReportShareListItem, error) {
	sharedWithUserID = strings.TrimSpace(sharedWithUserID)
	if sharedWithUserID == "" {
		return nil, ErrSupportReportShareInvalidTarget
	}
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	okManage, err := s.canManageSupportReportShares(viewerID, row)
	if err != nil {
		return nil, err
	}
	if !okManage {
		return nil, ErrSupportReportForbidden
	}
	if err := s.requireYandexTrackerShares(row); err != nil {
		return nil, err
	}
	if s.shareRepo == nil {
		return nil, ErrSupportReportPersistence
	}
	shares, err := s.shareRepo.ListByReportID(reportID)
	if err != nil {
		return nil, err
	}
	var backup models.SupportReportShare
	var haveBackup bool
	for i := range shares {
		if shares[i].SharedWithUserID == sharedWithUserID {
			backup = shares[i]
			haveBackup = true
			break
		}
	}
	if !haveBackup {
		return s.ListSupportReportShares(ctx, viewerID, reportID)
	}
	if err := s.shareRepo.DeleteByReportAndUser(reportID, sharedWithUserID); err != nil {
		return nil, err
	}
	if err := s.syncYandexAPIAccessToTicket(ctx, row); err != nil {
		if rbErr := s.shareRepo.Create(&backup); rbErr != nil {
			logger.Printf("ERROR support report: rollback share delete after Tracker sync failed reportID=%s sharedWithUserID=%s rollbackErr=%v syncErr=%v", reportID, sharedWithUserID, rbErr, err)
		}
		return nil, err
	}
	return s.ListSupportReportShares(ctx, viewerID, reportID)
}

// buildTrackerCompanyLabel returns "<tenant name> (<short legal name>)" from the user's primary company (first user_units row).
// Short legal name comes from company.counterparty (shortName, else fullName). If no legal short name, returns tenant name only.
func (s *SupportReportService) buildTrackerCompanyLabel(userID string) string {
	if s.companyRepo == nil {
		return ""
	}
	cid, err := s.userRepo.GetCompanyIDByUserID(userID)
	if err != nil || strings.TrimSpace(cid) == "" {
		return ""
	}
	comp, err := s.companyRepo.FindByID(cid)
	if err != nil || comp == nil {
		return ""
	}
	name := strings.TrimSpace(comp.Name)
	cp := parseCounterparty(comp.Counterparty)
	short := strings.TrimSpace(supplierShortLegal(cp))
	if name != "" && short != "" {
		return name + " (" + short + ")"
	}
	if name != "" {
		return name
	}
	return short
}

// supportReportManagerAccess is true for the author, platform_admin, or tenant-wide managers for the author's company
// (system_admin tenant role or company owner).
func (s *SupportReportService) supportReportManagerAccess(viewerID string, row *models.SupportReport) (bool, error) {
	if row == nil {
		return false, nil
	}
	if row.CreatedByUserID == viewerID {
		return true, nil
	}
	pf, err := s.userRepo.IsPlatformAdmin(viewerID)
	if err != nil {
		return false, err
	}
	if pf {
		return true, nil
	}
	authorCompany, err := s.userRepo.GetCompanyIDByUserID(row.CreatedByUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	if strings.TrimSpace(authorCompany) == "" {
		return false, nil
	}
	ok, err := s.userRepo.HasTenantSystemAdminRoleInCompany(viewerID, authorCompany)
	if err != nil {
		return false, err
	}
	if ok {
		return true, nil
	}
	return s.userRepo.IsCompanyOwner(viewerID, authorCompany)
}

// canViewSupportReport is true for author, tenant-wide managers, or users granted a share.
func (s *SupportReportService) canViewSupportReport(viewerID string, row *models.SupportReport) (bool, error) {
	if row == nil {
		return false, nil
	}
	if row.CreatedByUserID == viewerID {
		return true, nil
	}
	okMgr, err := s.supportReportManagerAccess(viewerID, row)
	if err != nil {
		return false, err
	}
	if okMgr {
		return true, nil
	}
	if s.shareRepo == nil {
		return false, nil
	}
	ok, err := s.shareRepo.Exists(row.ID, viewerID)
	if err != nil {
		return false, err
	}
	return ok, nil
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

// List returns reports visible to the user: own reports and shares; all reports in a company when the user is
// owner or system_admin there; all reports in the deployment only for platform_admin.
func (s *SupportReportService) List(ctx context.Context, userID string) ([]models.SupportReport, error) {
	pf, err := s.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		return nil, err
	}
	var tenantCompanies []string
	if !pf {
		tenantCompanies, err = s.userRepo.ListCompanyIDsForSupportReportTenantWideAccess(userID)
		if err != nil {
			return nil, err
		}
	}
	scope := repository.SupportReportListScope{
		PlatformWide:     pf,
		TenantCompanyIDs: tenantCompanies,
	}
	rows, err := s.repo.ListForUser(userID, scope)
	if err != nil {
		return nil, err
	}
	rows = s.filterRowsForConfiguredPlatform(rows)
	now := time.Now().UTC()
	type cand struct {
		idx int
		ts  time.Time
	}
	var candidates []cand
	for i := range rows {
		cli := s.clientForBackend(rows[i].TicketBackend)
		if cli == nil || !cli.Enabled() {
			continue
		}
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
	if len(candidates) > maxTicketRefreshPerList {
		candidates = candidates[:maxTicketRefreshPerList]
	}
	g, syncCtx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentTicketListRefresh)
	for _, c := range candidates {
		c := c
		g.Go(func() error {
			i := c.idx
			cli := s.clientForBackend(rows[i].TicketBackend)
			if cli == nil || !cli.Enabled() {
				return nil
			}
			callCtx, cancel := context.WithTimeout(syncCtx, ticketGetWorkItemTimeout)
			seq, st, err := cli.GetWorkItem(callCtx, rows[i].PlaneWorkItemID)
			cancel()
			if err != nil {
				logger.Printf("support report: List sync GetWorkItem id=%s externalId=%s: %v", rows[i].ID, rows[i].PlaneWorkItemID, err)
				return nil
			}
			if seq != nil {
				rows[i].PlaneSequenceID = seq
			}
			rows[i].PlaneStatus = st
			rows[i].LastSyncedAt = &now
			if err := s.repo.Update(&rows[i]); err != nil {
				logger.Printf("support report: List sync: update id=%s: %v", rows[i].ID, err)
			}
			return nil
		})
	}
	_ = g.Wait()
	return rows, nil
}

// GetByID returns one report if the user is the author, a tenant admin, or has been granted a share. Refreshes status when the row's backend client is enabled.
func (s *SupportReportService) GetByID(ctx context.Context, userID, reportID string) (*models.SupportReport, error) {
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	okView, err := s.canViewSupportReport(userID, row)
	if err != nil {
		return nil, err
	}
	if !okView {
		return nil, ErrSupportReportForbidden
	}
	if !s.reportMatchesConfiguredPlatform(row) {
		return nil, gorm.ErrRecordNotFound
	}
	cli := s.clientForBackend(row.TicketBackend)
	if cli != nil && cli.Enabled() && row.PlaneWorkItemID != "" {
		syncCtx, cancel := context.WithTimeout(ctx, ticketGetWorkItemTimeout)
		seq, st, err := cli.GetWorkItem(syncCtx, row.PlaneWorkItemID)
		cancel()
		if err != nil {
			logger.Printf("support report: GetByID sync GetWorkItem id=%s externalId=%s: %v", row.ID, row.PlaneWorkItemID, err)
		} else {
			if seq != nil {
				row.PlaneSequenceID = seq
			}
			row.PlaneStatus = st
			now := time.Now().UTC()
			row.LastSyncedAt = &now
			if err := s.repo.Update(row); err != nil {
				logger.Printf("support report: GetByID sync: update id=%s: %v", row.ID, err)
			}
		}
	}
	if s.userRepo != nil {
		if u, err := s.userRepo.FindByID(ctx, row.CreatedByUserID); err == nil && u != nil {
			row.CreatedByName = strings.TrimSpace(u.Name)
		}
	}
	return row, nil
}

// MarkIrrelevant marks the report as not relevant locally and posts a comment on the external ticket when possible.
func (s *SupportReportService) MarkIrrelevant(ctx context.Context, userID, reportID string) (*models.SupportReport, error) {
	row, err := s.repo.FindByID(reportID)
	if err != nil {
		return nil, err
	}
	ok, err := s.supportReportManagerAccess(userID, row)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrSupportReportForbidden
	}
	if !s.reportMatchesConfiguredPlatform(row) {
		return nil, gorm.ErrRecordNotFound
	}
	if row.MarkedIrrelevantAt != nil {
		return row, nil
	}
	comment := s.cancelComment
	cli := s.clientForBackend(row.TicketBackend)
	if cli != nil && cli.Enabled() && strings.TrimSpace(row.PlaneWorkItemID) != "" {
		if err := cli.AddComment(ctx, strings.TrimSpace(row.PlaneWorkItemID), comment); err != nil {
			if errors.Is(err, ErrPlaneCommentsUnsupported) {
				logger.Printf("support report: MarkIrrelevant skipping external cancel comment (backend does not support posting this comment) reportID=%s workItemID=%s", reportID, strings.TrimSpace(row.PlaneWorkItemID))
			} else {
				return nil, err
			}
		}
	}
	now := time.Now().UTC()
	row.MarkedIrrelevantAt = &now
	row.MarkedIrrelevantByUserID = userID
	if err := s.repo.Update(row); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSupportReportPersistence, err)
	}
	return row, nil
}

// Errors for support reports.
var (
	ErrSupportTicketIntegrationNotConfigured = errors.New("support ticket integration is not configured")
	// ErrPlaneNotConfigured is an alias for ErrSupportTicketIntegrationNotConfigured.
	ErrPlaneNotConfigured              = ErrSupportTicketIntegrationNotConfigured
	ErrSupportReportInvalidTitle       = errors.New("invalid title")
	ErrSupportReportInvalidDescription = errors.New("invalid description")
	ErrSupportReportInvalidUnit        = errors.New("invalid unit")
	ErrSupportReportForbidden          = errors.New("forbidden")
	// ErrSupportReportPersistence wraps DB errors after external ticket calls.
	ErrSupportReportPersistence = errors.New("support report persistence failed")
	// ErrSupportReportSharesYandexOnly is returned when share APIs are used on a non–Yandex Tracker report.
	ErrSupportReportSharesYandexOnly   = errors.New("support report sharing is only available for Yandex Tracker tickets")
	ErrSupportReportShareInvalidTarget = errors.New("invalid share target user")
	ErrSupportReportShareSelf          = errors.New("cannot share a support report with its author")
	ErrSupportReportCommentsYandexOnly = errors.New("support report comments are only available for Yandex Tracker tickets")
	ErrSupportReportInvalidAudience    = errors.New("invalid comments audience (use staff or applicant)")
)
