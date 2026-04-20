package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// LeadIssueKind selects Tracker type mapping from deployment settings.
type LeadIssueKind int

const (
	LeadIssueRegistration LeadIssueKind = iota
	LeadIssueRequest
	LeadIssueError
)

// LeadIssueService creates Yandex Tracker issues for marketing/signup flows (separate queue from support).
type LeadIssueService struct {
	settingsRepo repository.DeploymentSaaSSettingsRepository
	tracker      *YandexTrackerClient
}

// NewLeadIssueService constructs LeadIssueService (tracker may be nil in tests).
func NewLeadIssueService(settingsRepo repository.DeploymentSaaSSettingsRepository, tracker *YandexTrackerClient) *LeadIssueService {
	return &LeadIssueService{settingsRepo: settingsRepo, tracker: tracker}
}

// ResolveLeadsTrackerQueue returns queue from DB settings, else YANDEX_TRACKER_LEADS_QUEUE.
func ResolveLeadsTrackerQueue(settings *models.DeploymentSaaSSettings) string {
	if settings != nil {
		if q := strings.TrimSpace(settings.LeadsTrackerQueue); q != "" {
			return q
		}
	}
	return strings.TrimSpace(os.Getenv("YANDEX_TRACKER_LEADS_QUEUE"))
}

func leadIssueTypeRaw(settings *models.DeploymentSaaSSettings, k LeadIssueKind) string {
	if settings == nil {
		return ""
	}
	switch k {
	case LeadIssueRegistration:
		return settings.TrackerTypeRegistration
	case LeadIssueRequest:
		return settings.TrackerTypeRequest
	case LeadIssueError:
		return settings.TrackerTypeError
	default:
		return ""
	}
}

// LeadsConfigured returns true when a leads queue is set and Tracker credentials are ready.
func (s *LeadIssueService) LeadsConfigured(_ context.Context) (bool, error) {
	if s == nil || s.settingsRepo == nil {
		return false, nil
	}
	st, err := s.settingsRepo.Get()
	if err != nil {
		return false, err
	}
	q := ResolveLeadsTrackerQueue(st)
	if q == "" {
		return false, nil
	}
	if s.tracker == nil || !s.tracker.CredentialsReady() {
		return false, nil
	}
	return true, nil
}

// leadIssueTrackerHTTPTimeout bounds outbound Tracker HTTP for best-effort notifications.
const leadIssueTrackerHTTPTimeout = 2 * time.Second

func loggerPrintfLeadIssueErr(kind string, err error) {
	logger.Printf("lead issue [%s]: tracker create failed: %v", kind, err)
}

// logSignupFailureInternal logs the full server error and trace ID for correlation (not sent to Tracker).
func logSignupFailureInternal(traceID, errText string) {
	logger.Printf("lead issue [signup failure]: trace_id=%s full_error=%s", traceID, errText)
}

// NotifyTrialRegistration best-effort after successful signup. Non-blocking; uses a short timeout for the Tracker call.
func (s *LeadIssueService) NotifyTrialRegistration(ctx context.Context, companyName, companySlug, userName, userEmail, planCode string) {
	if s == nil || s.settingsRepo == nil || s.tracker == nil {
		return
	}
	li := s
	cn, cs, un, ue, pc := companyName, companySlug, userName, userEmail, planCode
	parentCtx := ctx
	go func() {
		// WithoutCancel: outbound Tracker call must not be cut off when the HTTP handler returns.
		runCtx, cancel := context.WithTimeout(context.WithoutCancel(parentCtx), leadIssueTrackerHTTPTimeout)
		defer cancel()
		li.notifyTrialRegistrationSync(runCtx, cn, cs, un, ue, pc)
	}()
}

func (s *LeadIssueService) notifyTrialRegistrationSync(ctx context.Context, companyName, companySlug, userName, userEmail, planCode string) {
	st, err := s.settingsRepo.Get()
	if err != nil {
		return
	}
	queue := ResolveLeadsTrackerQueue(st)
	if queue == "" || !s.tracker.CredentialsReady() {
		return
	}
	title := fmt.Sprintf("[TRIAL] %s", strings.TrimSpace(companyName))
	if strings.TrimSpace(title) == "[TRIAL]" {
		title = "[TRIAL] New registration"
	}
	var b strings.Builder
	b.WriteString("New tenant registration (trial).\n\n")
	fmt.Fprintf(&b, "- **Company**: %s\n", companyName)
	fmt.Fprintf(&b, "- **Tenant slug**: `%s`\n", strings.ReplaceAll(strings.TrimSpace(companySlug), "`", "'"))
	fmt.Fprintf(&b, "- **User**: %s\n", userName)
	fmt.Fprintf(&b, "- **Email**: %s\n", userEmail)
	fmt.Fprintf(&b, "- **Plan code**: %s\n", planCode)
	traceID := uuid.New().String()
	diag, _ := json.Marshal(map[string]string{"kind": "trial_registration"})
	desc := BuildSupportDescriptionMarkdown(b.String(), diag, traceID)
	extras := SupportReportTicketCreateExtras{
		ApplicantsEmail:     strings.TrimSpace(userEmail),
		CompanyTrackerLabel: strings.TrimSpace(companyName),
	}
	opts := YandexTrackerIssueCreateOpts{
		QueueKey: queue,
		TypeRaw:  strings.TrimSpace(leadIssueTypeRaw(st, LeadIssueRegistration)),
	}
	_, _, _, err = s.tracker.CreateWorkItemWithOpts(ctx, uuid.New().String(), title, desc, extras, opts)
	if err != nil {
		loggerPrintfLeadIssueErr("trial registration", err)
	}
}

// NotifySignupFailure best-effort when signup returns 500. Non-blocking; does not send raw errors to Tracker.
func (s *LeadIssueService) NotifySignupFailure(ctx context.Context, companyName, userEmail, planCode, errText string) {
	if s == nil || s.settingsRepo == nil || s.tracker == nil {
		return
	}
	li := s
	cn, ue, pc, et := companyName, userEmail, planCode, errText
	parentCtx := ctx
	go func() {
		runCtx, cancel := context.WithTimeout(context.WithoutCancel(parentCtx), leadIssueTrackerHTTPTimeout)
		defer cancel()
		li.notifySignupFailureSync(runCtx, cn, ue, pc, et)
	}()
}

func (s *LeadIssueService) notifySignupFailureSync(ctx context.Context, companyName, userEmail, planCode, errText string) {
	traceID := uuid.New().String()
	logSignupFailureInternal(traceID, errText)

	st, err := s.settingsRepo.Get()
	if err != nil {
		return
	}
	queue := ResolveLeadsTrackerQueue(st)
	if queue == "" || !s.tracker.CredentialsReady() {
		return
	}
	title := "[ERR] Signup failure"
	var b strings.Builder
	b.WriteString("Registration failed on the server.\n\n")
	fmt.Fprintf(&b, "- **Company (requested)**: %s\n", companyName)
	fmt.Fprintf(&b, "- **Email (requested)**: %s\n", userEmail)
	fmt.Fprintf(&b, "- **Plan code**: %s\n", planCode)
	fmt.Fprintf(&b, "- **Error summary**: Internal server error during registration. Full details were logged internally; use the trace ID in the diagnostics block for correlation.\n")
	diag, _ := json.Marshal(map[string]string{"kind": "signup_failure", "traceId": traceID})
	desc := BuildSupportDescriptionMarkdown(b.String(), diag, traceID)
	extras := SupportReportTicketCreateExtras{
		ApplicantsEmail:     strings.TrimSpace(userEmail),
		CompanyTrackerLabel: strings.TrimSpace(companyName),
	}
	opts := YandexTrackerIssueCreateOpts{
		QueueKey: queue,
		TypeRaw:  strings.TrimSpace(leadIssueTypeRaw(st, LeadIssueError)),
	}
	_, _, _, err = s.tracker.CreateWorkItemWithOpts(ctx, uuid.New().String(), title, desc, extras, opts)
	if err != nil {
		logger.Printf("lead issue [signup failure]: trace_id=%s tracker create failed: %v", traceID, err)
	}
}

// CreateLeadRequest creates a Tracker issue from the public marketing form ([REQ]).
func (s *LeadIssueService) CreateLeadRequest(ctx context.Context, name, email, company, message, source, locale, referrer, planCode string, privacyConsentRecorded bool) error {
	if s == nil || s.settingsRepo == nil || s.tracker == nil {
		return fmt.Errorf("lead issue service not configured")
	}
	st, err := s.settingsRepo.Get()
	if err != nil {
		return err
	}
	queue := ResolveLeadsTrackerQueue(st)
	if queue == "" {
		return fmt.Errorf("leads queue is not configured")
	}
	if !s.tracker.CredentialsReady() {
		return fmt.Errorf("yandex tracker is not configured")
	}
	title := "[REQ] " + strings.TrimSpace(company)
	if strings.TrimSpace(title) == "[REQ]" {
		title = "[REQ] Lead request"
	}
	var b strings.Builder
	b.WriteString(strings.TrimSpace(message))
	if b.Len() == 0 {
		b.WriteString("(no message)")
	}
	b.WriteString("\n\n")
	fmt.Fprintf(&b, "- **Name**: %s\n", name)
	fmt.Fprintf(&b, "- **Email**: %s\n", email)
	if privacyConsentRecorded {
		fmt.Fprintf(&b, "- **Personal data consent**: yes (privacy policy acknowledged)\n")
	}
	if strings.TrimSpace(company) != "" {
		fmt.Fprintf(&b, "- **Company**: %s\n", company)
	}
	if strings.TrimSpace(planCode) != "" {
		fmt.Fprintf(&b, "- **Plan code (context)**: %s\n", planCode)
	}
	fmt.Fprintf(&b, "- **Source**: %s\n", source)
	fmt.Fprintf(&b, "- **Locale**: %s\n", locale)
	if strings.TrimSpace(referrer) != "" {
		fmt.Fprintf(&b, "- **Referrer**: %s\n", referrer)
	}
	traceID := uuid.New().String()
	diag, _ := json.Marshal(map[string]string{"kind": "lead_request", "source": source})
	desc := BuildSupportDescriptionMarkdown(b.String(), diag, traceID)
	extras := SupportReportTicketCreateExtras{
		ApplicantsEmail:     strings.TrimSpace(email),
		CompanyTrackerLabel: strings.TrimSpace(company),
	}
	opts := YandexTrackerIssueCreateOpts{
		QueueKey: queue,
		TypeRaw:  strings.TrimSpace(leadIssueTypeRaw(st, LeadIssueRequest)),
	}
	_, _, _, err = s.tracker.CreateWorkItemWithOpts(ctx, uuid.New().String(), title, desc, extras, opts)
	return err
}

// CreatePlanChangeRequest creates a Tracker issue when an authenticated tenant user requests a subscription plan change.
// Uses the same leads queue and request issue type as marketing leads ([REQ] / LeadIssueRequest).
func (s *LeadIssueService) CreatePlanChangeRequest(ctx context.Context,
	companyID, companyName, companySlug string,
	userDisplayName, userEmail string,
	currentPlanCode, requestedPlanCode string,
) error {
	if s == nil || s.settingsRepo == nil || s.tracker == nil {
		return fmt.Errorf("lead issue service not configured")
	}
	st, err := s.settingsRepo.Get()
	if err != nil {
		return err
	}
	queue := ResolveLeadsTrackerQueue(st)
	if queue == "" {
		return fmt.Errorf("leads queue is not configured")
	}
	if !s.tracker.CredentialsReady() {
		return fmt.Errorf("yandex tracker is not configured")
	}
	cn := strings.TrimSpace(companyName)
	if cn == "" {
		cn = "(unknown company)"
	}
	cs := strings.TrimSpace(companySlug)
	req := strings.TrimSpace(requestedPlanCode)
	cur := strings.TrimSpace(currentPlanCode)
	title := fmt.Sprintf("[PLAN] Change plan → %s", req)
	if cs != "" {
		title = fmt.Sprintf("[PLAN] %s: change plan → %s", cs, req)
	}
	var b strings.Builder
	b.WriteString("Tenant user requested a subscription plan change. Apply after review in Tracker.\n\n")
	fmt.Fprintf(&b, "- **Company**: %s\n", cn)
	if cs != "" {
		fmt.Fprintf(&b, "- **Tenant slug**: `%s`\n", strings.ReplaceAll(cs, "`", "'"))
	}
	fmt.Fprintf(&b, "- **Company ID**: `%s`\n", strings.ReplaceAll(strings.TrimSpace(companyID), "`", "'"))
	fmt.Fprintf(&b, "- **Requested by**: %s\n", strings.TrimSpace(userDisplayName))
	fmt.Fprintf(&b, "- **Email**: %s\n", strings.TrimSpace(userEmail))
	fmt.Fprintf(&b, "- **Current plan code**: %s\n", cur)
	fmt.Fprintf(&b, "- **Requested plan code**: %s\n", req)
	traceID := uuid.New().String()
	diag, _ := json.Marshal(map[string]string{"kind": "plan_change_request"})
	desc := BuildSupportDescriptionMarkdown(b.String(), diag, traceID)
	extras := SupportReportTicketCreateExtras{
		ApplicantsEmail:     strings.TrimSpace(userEmail),
		CompanyTrackerLabel: cn,
	}
	opts := YandexTrackerIssueCreateOpts{
		QueueKey: queue,
		TypeRaw:  strings.TrimSpace(leadIssueTypeRaw(st, LeadIssueRequest)),
	}
	_, _, _, err = s.tracker.CreateWorkItemWithOpts(ctx, uuid.New().String(), title, desc, extras, opts)
	return err
}

// CreateTenantCustomTermsLeadRequest creates a [REQ] Tracker issue when an authenticated tenant user asks for individual pricing / custom terms (Settings → Pricing).
func (s *LeadIssueService) CreateTenantCustomTermsLeadRequest(ctx context.Context,
	companyID, companyName, companySlug string,
	userDisplayName, userEmail, comment string,
) error {
	if s == nil || s.settingsRepo == nil || s.tracker == nil {
		return fmt.Errorf("lead issue service not configured")
	}
	st, err := s.settingsRepo.Get()
	if err != nil {
		return err
	}
	queue := ResolveLeadsTrackerQueue(st)
	if queue == "" {
		return fmt.Errorf("leads queue is not configured")
	}
	if !s.tracker.CredentialsReady() {
		return fmt.Errorf("yandex tracker is not configured")
	}
	cn := strings.TrimSpace(companyName)
	if cn == "" {
		cn = "(unknown company)"
	}
	cs := strings.TrimSpace(companySlug)
	title := "[REQ] " + cn
	var b strings.Builder
	msg := strings.TrimSpace(comment)
	if msg == "" {
		msg = "(no message)"
	}
	b.WriteString(msg)
	b.WriteString("\n\n")
	b.WriteString("Individual pricing / custom terms request from **Settings → Pricing**.\n\n")
	fmt.Fprintf(&b, "- **Company**: %s\n", cn)
	if cs != "" {
		fmt.Fprintf(&b, "- **Tenant slug**: `%s`\n", strings.ReplaceAll(cs, "`", "'"))
	}
	fmt.Fprintf(&b, "- **Company ID**: `%s`\n", strings.ReplaceAll(strings.TrimSpace(companyID), "`", "'"))
	fmt.Fprintf(&b, "- **Requested by**: %s\n", strings.TrimSpace(userDisplayName))
	fmt.Fprintf(&b, "- **Email**: %s\n", strings.TrimSpace(userEmail))
	fmt.Fprintf(&b, "- **Source**: %s\n", "tenant_settings_pricing")
	traceID := uuid.New().String()
	diag, _ := json.Marshal(map[string]string{"kind": "tenant_custom_terms", "source": "tenant_settings_pricing"})
	desc := BuildSupportDescriptionMarkdown(b.String(), diag, traceID)
	extras := SupportReportTicketCreateExtras{
		ApplicantsEmail:     strings.TrimSpace(userEmail),
		CompanyTrackerLabel: cn,
	}
	opts := YandexTrackerIssueCreateOpts{
		QueueKey: queue,
		TypeRaw:  strings.TrimSpace(leadIssueTypeRaw(st, LeadIssueRequest)),
	}
	_, _, _, err = s.tracker.CreateWorkItemWithOpts(ctx, uuid.New().String(), title, desc, extras, opts)
	return err
}
