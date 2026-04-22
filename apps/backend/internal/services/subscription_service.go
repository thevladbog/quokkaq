package services

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionplan"

	"gorm.io/gorm"
)

// SubscriptionRequestError is returned by SubscriptionService workflow methods for mapping to HTTP responses.
type SubscriptionRequestError struct {
	Status  int
	Message string
	LogErr  error
}

func (e *SubscriptionRequestError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

// SubscriptionService orchestrates subscription-related tenant workflows (plan-change and custom-terms Tracker leads).
type SubscriptionService struct {
	subscriptionRepo repository.SubscriptionRepository
	userRepo         repository.UserRepository
	companyRepo      repository.CompanyRepository
	leadIssues       *LeadIssueService
}

// NewSubscriptionService constructs SubscriptionService. leadIssues may be nil (requests disabled).
func NewSubscriptionService(
	subscriptionRepo repository.SubscriptionRepository,
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	leadIssues *LeadIssueService,
) *SubscriptionService {
	return &SubscriptionService{
		subscriptionRepo: subscriptionRepo,
		userRepo:         userRepo,
		companyRepo:      companyRepo,
		leadIssues:       leadIssues,
	}
}

func (s *SubscriptionService) ensureBillingAdmin(ctx context.Context, userID, companyID string) error {
	isAdmin, err := s.userRepo.IsAdmin(userID)
	if err != nil {
		logger.PrintfCtx(ctx, "subscription billing auth IsAdmin: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	if isAdmin {
		return nil
	}
	isOwner, err := s.userRepo.IsCompanyOwner(userID, companyID)
	if err != nil {
		logger.PrintfCtx(ctx, "subscription billing auth IsCompanyOwner: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	if !isOwner {
		return &SubscriptionRequestError{Status: http.StatusForbidden, Message: "Forbidden"}
	}
	return nil
}

func (s *SubscriptionService) resolveCompanyOrHTTPError(ctx context.Context, userID, xCompanyID string) (companyID string, err error) {
	cid, err := s.userRepo.ResolveCompanyIDForRequest(userID, xCompanyID)
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			return "", &SubscriptionRequestError{
				Status:  http.StatusForbidden,
				Message: "Forbidden: no access to selected organization",
			}
		}
		if repository.IsNotFound(err) {
			return "", &SubscriptionRequestError{
				Status:  http.StatusNotFound,
				Message: "User has no associated company",
			}
		}
		logger.PrintfCtx(ctx, "ResolveCompanyIDForRequest: %v", err)
		return "", &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	return cid, nil
}

// currentPlanCodeForLead returns the current plan code for Tracker copy; uses preloaded Plan when it matches PlanID, otherwise loads by PlanID.
func (s *SubscriptionService) currentPlanCodeForLead(sub *models.Subscription) string {
	if s == nil || sub == nil {
		return ""
	}
	pid := strings.TrimSpace(sub.PlanID)
	if pid == "" {
		return ""
	}
	if sub.Plan.ID != "" && sub.Plan.ID == pid {
		return strings.TrimSpace(sub.Plan.Code)
	}
	cur, err := s.subscriptionRepo.FindPlanByID(pid)
	if err != nil || cur == nil {
		return ""
	}
	return strings.TrimSpace(cur.Code)
}

// SubmitPlanChangeRequest validates subscription/plan state and creates a Tracker plan-change ticket.
// requestedPlanCode must be non-empty (trimmed by caller). billingPeriod is "month" or "annual" (default month).
func (s *SubscriptionService) SubmitPlanChangeRequest(ctx context.Context, userID, xCompanyID, requestedPlanCode, billingPeriod string) error {
	if s == nil || s.leadIssues == nil {
		return &SubscriptionRequestError{
			Status:  http.StatusServiceUnavailable,
			Message: "Plan change requests are not configured",
		}
	}
	companyID, err := s.resolveCompanyOrHTTPError(ctx, userID, xCompanyID)
	if err != nil {
		return err
	}
	if err := s.ensureBillingAdmin(ctx, userID, companyID); err != nil {
		return err
	}
	requested := strings.TrimSpace(requestedPlanCode)
	subscription, err := s.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SubscriptionRequestError{Status: http.StatusNotFound, Message: "No subscription found"}
		}
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest FindByCompanyID: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	requestedPlan, err := s.subscriptionRepo.FindPlanByCode(requested)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SubscriptionRequestError{
				Status:  http.StatusBadRequest,
				Message: "Unknown or unavailable plan code",
			}
		}
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest FindPlanByCode: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	if !requestedPlan.IsActive {
		return &SubscriptionRequestError{
			Status:  http.StatusBadRequest,
			Message: "Plan is inactive or unavailable",
		}
	}
	bp := strings.TrimSpace(strings.ToLower(billingPeriod))
	if bp == "" {
		bp = "month"
	}
	if bp != "month" && bp != "annual" {
		return &SubscriptionRequestError{Status: http.StatusBadRequest, Message: "billingPeriod must be month or annual"}
	}
	if bp == "annual" && !subscriptionplan.HasAnnualPrepayConfig(requestedPlan) {
		return &SubscriptionRequestError{
			Status:  http.StatusBadRequest,
			Message: "annual billing is not available for the requested plan",
		}
	}
	currentPlanID := strings.TrimSpace(subscription.PlanID)
	if currentPlanID != "" && requestedPlan.ID != "" && currentPlanID == requestedPlan.ID {
		return &SubscriptionRequestError{Status: http.StatusBadRequest, Message: "Already on this plan"}
	}
	currentCode := s.currentPlanCodeForLead(subscription)
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest FindByID user: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	userEmail := ""
	if user.Email != nil {
		userEmail = strings.TrimSpace(*user.Email)
	}
	company, err := s.companyRepo.FindByID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SubscriptionRequestError{Status: http.StatusNotFound, Message: "Company not found"}
		}
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest companyRepo.FindByID: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	okTracker, err := s.leadIssues.LeadsConfigured(ctx)
	if err != nil {
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest LeadsConfigured: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	if !okTracker {
		return &SubscriptionRequestError{
			Status:  http.StatusServiceUnavailable,
			Message: "Plan change requests are not available (Tracker or leads queue not configured)",
		}
	}
	err = s.leadIssues.CreatePlanChangeRequest(ctx,
		companyID,
		strings.TrimSpace(company.Name),
		strings.TrimSpace(company.Slug),
		strings.TrimSpace(user.Name),
		userEmail,
		currentCode,
		requested,
		bp,
	)
	if err != nil {
		logger.PrintfCtx(ctx, "SubmitPlanChangeRequest CreatePlanChangeRequest: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusBadGateway,
			Message: "Failed to create Tracker ticket",
			LogErr:  err,
		}
	}
	return nil
}

// SubmitCustomTermsRequest creates a Tracker [REQ] ticket for individual pricing / custom terms.
// comment must be non-empty and within length limits (validated by caller). billingPeriod is "month" or "annual" (default month).
func (s *SubscriptionService) SubmitCustomTermsRequest(ctx context.Context, userID, xCompanyID, comment, billingPeriod string) error {
	if s == nil || s.leadIssues == nil {
		return &SubscriptionRequestError{
			Status:  http.StatusServiceUnavailable,
			Message: "Lead requests are not configured",
		}
	}
	companyID, err := s.resolveCompanyOrHTTPError(ctx, userID, xCompanyID)
	if err != nil {
		return err
	}
	if err := s.ensureBillingAdmin(ctx, userID, companyID); err != nil {
		return err
	}
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		logger.PrintfCtx(ctx, "SubmitCustomTermsRequest FindByID user: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	userEmail := ""
	if user.Email != nil {
		userEmail = strings.TrimSpace(*user.Email)
	}
	company, err := s.companyRepo.FindByID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SubscriptionRequestError{Status: http.StatusNotFound, Message: "Company not found"}
		}
		logger.PrintfCtx(ctx, "SubmitCustomTermsRequest companyRepo.FindByID: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	okTracker, err := s.leadIssues.LeadsConfigured(ctx)
	if err != nil {
		logger.PrintfCtx(ctx, "SubmitCustomTermsRequest LeadsConfigured: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusInternalServerError,
			Message: "Internal server error",
			LogErr:  err,
		}
	}
	if !okTracker {
		return &SubscriptionRequestError{
			Status:  http.StatusServiceUnavailable,
			Message: "Lead requests are not available (Tracker or leads queue not configured)",
		}
	}
	ctbp := strings.TrimSpace(strings.ToLower(billingPeriod))
	if ctbp == "" {
		ctbp = "month"
	}
	if ctbp != "month" && ctbp != "annual" {
		return &SubscriptionRequestError{Status: http.StatusBadRequest, Message: "billingPeriod must be month or annual"}
	}
	err = s.leadIssues.CreateTenantCustomTermsLeadRequest(ctx,
		companyID,
		strings.TrimSpace(company.Name),
		strings.TrimSpace(company.Slug),
		strings.TrimSpace(user.Name),
		userEmail,
		comment,
		ctbp,
	)
	if err != nil {
		logger.PrintfCtx(ctx, "SubmitCustomTermsRequest CreateTenantCustomTermsLeadRequest: %v", err)
		return &SubscriptionRequestError{
			Status:  http.StatusBadGateway,
			Message: "Failed to create Tracker ticket",
			LogErr:  err,
		}
	}
	return nil
}
