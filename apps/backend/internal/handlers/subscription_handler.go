package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/services/subscriptions"
	"quokkaq-go-backend/pkg/database"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type SubscriptionHandler struct {
	subscriptionRepo repository.SubscriptionRepository
	userRepo         repository.UserRepository
	companyRepo      repository.CompanyRepository
	paymentProvider  services.PaymentProvider
	leadIssues       *services.LeadIssueService
}

func NewSubscriptionHandler(
	subscriptionRepo repository.SubscriptionRepository,
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	paymentProvider services.PaymentProvider,
	leadIssues *services.LeadIssueService,
) *SubscriptionHandler {
	return &SubscriptionHandler{
		subscriptionRepo: subscriptionRepo,
		userRepo:         userRepo,
		companyRepo:      companyRepo,
		paymentProvider:  paymentProvider,
		leadIssues:       leadIssues,
	}
}

// billingMockCheckoutAllowed returns true when BILLING_MOCK_CHECKOUT is set and APP_ENV is not production.
// Used only for local/tests; never enable in production.
func billingMockCheckoutAllowed() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") {
		return false
	}
	v := strings.ToLower(strings.TrimSpace(os.Getenv("BILLING_MOCK_CHECKOUT")))
	return v == "true" || v == "1" || v == "yes"
}

// mockCheckoutBaseURL returns APP_BASE_URL with a localhost default for BILLING_MOCK_CHECKOUT / local dev only.
func mockCheckoutBaseURL() string {
	base := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if base == "" {
		base = "http://localhost:3000"
	}
	return strings.TrimRight(base, "/")
}

// checkoutBaseURLValidForPaymentProvider returns a trimmed base URL suitable for real payment redirects.
// Empty APP_BASE_URL, invalid URL, or localhost / loopback hosts are rejected (ok == false).
func checkoutBaseURLValidForPaymentProvider() (base string, ok bool) {
	raw := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if raw == "" {
		return "", false
	}
	base = strings.TrimRight(raw, "/")
	u, err := url.Parse(base)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return "", false
	}
	return base, true
}

// requireBillingAdmin allows platform admins or the company owner to perform billing mutations.
func (h *SubscriptionHandler) requireBillingAdmin(w http.ResponseWriter, ctx context.Context, userID, companyID string) bool {
	isAdmin, err := h.userRepo.IsAdmin(userID)
	if err != nil {
		logger.PrintfCtx(ctx, "subscription billing auth IsAdmin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if isAdmin {
		return true
	}
	isOwner, err := h.userRepo.IsCompanyOwner(userID, companyID)
	if err != nil {
		logger.PrintfCtx(ctx, "subscription billing auth IsCompanyOwner: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if !isOwner {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return false
	}
	return true
}

// GetMySubscription godoc
// @ID           getMySubscription
// @Summary      Get Current User's Subscription
// @Description  Returns subscription for the authenticated user's company
// @Tags         subscriptions
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200  {object}  models.Subscription
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden: no access to selected organization"
// @Failure      404  {string}  string "No subscription found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscriptions/me [get]
func (h *SubscriptionHandler) GetMySubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "GetMySubscription userRepo.ResolveCompanyIDForRequest(%q): %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "No subscription found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "GetMySubscription subscriptionRepo.FindByCompanyID(%q): %v", companyID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	promoted, err := subscriptions.ApplyPendingPlanIfDue(database.DB, subscription, time.Now().UTC())
	if err != nil {
		logger.PrintfCtx(r.Context(), "GetMySubscription ApplyPendingPlanIfDue: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if promoted {
		subscription, err = h.subscriptionRepo.FindByCompanyID(companyID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "No subscription found", http.StatusNotFound)
				return
			}
			logger.PrintfCtx(r.Context(), "GetMySubscription subscriptionRepo.FindByCompanyID reload: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
}

// GetMySubscriptionPlans godoc
// @Summary      Subscription plans for tenant catalog
// @Description  Active public plans plus this company's current and pending plans even when those plans are not public (assigned by platform).
// @Tags         subscriptions
// @Produce      json
// @ID           getMySubscriptionPlans
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200  {array}   models.SubscriptionPlan
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscriptions/me/plans [get]
func (h *SubscriptionHandler) GetMySubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "GetMySubscriptionPlans ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			plans, err := h.subscriptionRepo.GetActivePlans()
			if err != nil {
				logger.PrintfCtx(r.Context(), "GetMySubscriptionPlans GetActivePlans (no sub): %v", err)
				http.Error(w, "Failed to fetch subscription plans", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			RespondJSON(w, plans)
			return
		}
		logger.PrintfCtx(r.Context(), "GetMySubscriptionPlans FindByCompanyID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var extraIDs []string
	if strings.TrimSpace(subscription.PlanID) != "" {
		extraIDs = append(extraIDs, subscription.PlanID)
	}
	if subscription.PendingPlanID != nil && strings.TrimSpace(*subscription.PendingPlanID) != "" {
		extraIDs = append(extraIDs, strings.TrimSpace(*subscription.PendingPlanID))
	}

	plans, err := h.subscriptionRepo.GetActivePlansForTenant(extraIDs)
	if err != nil {
		logger.PrintfCtx(r.Context(), "GetMySubscriptionPlans GetActivePlansForTenant: %v", err)
		http.Error(w, "Failed to fetch subscription plans", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plans)
}

// GetPlans godoc
// @Summary      Get Available Subscription Plans
// @Description  Returns all active subscription plans
// @Tags         subscriptions
// @Produce      json
// @ID           getSubscriptionPlans
// @Success      200  {array}   models.SubscriptionPlan
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscriptions/plans [get]
func (h *SubscriptionHandler) GetPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.subscriptionRepo.GetActivePlans()
	if err != nil {
		logger.PrintfCtx(r.Context(), "GetPlans subscriptionRepo.GetActivePlans: %v", err)
		http.Error(w, "Failed to fetch subscription plans", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plans)
}

// CreateCheckoutRequest represents checkout session request
type CreateCheckoutRequest struct {
	PlanCode string `json:"planCode"`
}

// CreateCheckoutResponse represents checkout session response
type CreateCheckoutResponse struct {
	CheckoutURL string `json:"checkoutUrl"`
	SessionID   string `json:"sessionId"`
}

// CreateCheckout godoc
// @ID           createCheckout
// @Summary      Create Checkout Session
// @Description  Creates a checkout session for subscription upgrade
// @Tags         subscriptions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        request body CreateCheckoutRequest true "Checkout Request"
// @Success      200  {object}  CreateCheckoutResponse
// @Failure      400  {string}  string "Bad Request (e.g. missing public APP_BASE_URL for real checkout)"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      409  {string}  string "Conflict (e.g. plan not eligible for instant self-service checkout)"
// @Failure      501  {string}  string "Billing checkout not configured"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscriptions/checkout [post]
func (h *SubscriptionHandler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateCheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	planCode := strings.TrimSpace(req.PlanCode)
	if planCode == "" {
		http.Error(w, "planCode is required", http.StatusBadRequest)
		return
	}

	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "CreateCheckout userRepo.ResolveCompanyIDForRequest(%q): %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !h.requireBillingAdmin(w, r.Context(), userID, companyID) {
		return
	}

	plan, err := h.subscriptionRepo.FindPlanByCode(planCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unknown plan code", http.StatusBadRequest)
			return
		}
		logger.PrintfCtx(r.Context(), "CreateCheckout subscriptionRepo.FindPlanByCode(%q): %v", planCode, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !plan.IsActive {
		http.Error(w, "Plan is not available", http.StatusBadRequest)
		return
	}
	if !plan.IsPublic {
		http.Error(w, "Plan is not available", http.StatusBadRequest)
		return
	}
	if !plan.AllowInstantPurchase {
		http.Error(w, "This plan is not available for self-service checkout; contact sales to request access.", http.StatusConflict)
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "No subscription found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "CreateCheckout subscriptionRepo.FindByCompanyID(%q): %v", companyID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if h.paymentProvider != nil {
		base, valid := checkoutBaseURLValidForPaymentProvider()
		if !valid {
			http.Error(w, "APP_BASE_URL must be set to a public HTTPS (or HTTP) origin for billing checkout; localhost and loopback are not allowed. Configure APP_BASE_URL (e.g. https://app.example.com) or use BILLING_MOCK_CHECKOUT for non-production testing.", http.StatusBadRequest)
			return
		}
		successURL := base + "/settings/organization/billing?checkout=success"
		cancelURL := base + "/settings/organization/billing?checkout=cancel"
		checkoutURL, sessionID, cerr := h.paymentProvider.CreateCheckoutSession(r.Context(), subscription, plan, successURL, cancelURL)
		if cerr != nil {
			http.Error(w, "Failed to create checkout session", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		RespondJSON(w, CreateCheckoutResponse{CheckoutURL: checkoutURL, SessionID: sessionID})
		return
	}

	if !billingMockCheckoutAllowed() {
		http.Error(w, "Billing checkout is not configured (payment provider unavailable). Set STRIPE_SECRET_KEY and do not set BILLING_ENABLED=false, or set BILLING_MOCK_CHECKOUT=true for non-production testing only.", http.StatusNotImplemented)
		return
	}

	mockBase := mockCheckoutBaseURL()
	mockSuccess := mockBase + "/settings/organization/billing?checkout=success"
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, CreateCheckoutResponse{
		CheckoutURL: mockSuccess,
		SessionID:   "mock-session-id",
	})
}

// CancelSubscription godoc
// @Summary      Cancel Subscription
// @Description  Cancels the subscription at the end of billing period
// @Tags         subscriptions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Subscription ID"
// @Success      200  {object}  models.Subscription
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      500  {string}  string "Internal Server Error"
// @Failure      502  {string}  string "Bad Gateway - payment provider failure"
// @Router       /subscriptions/{id}/cancel [post]
func (h *SubscriptionHandler) CancelSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subscriptionID := chi.URLParam(r, "id")

	subscription, err := h.subscriptionRepo.FindByID(subscriptionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Subscription not found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "CancelSubscription subscriptionRepo.FindByID(%q): %v", subscriptionID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if !h.requireBillingAdmin(w, r.Context(), userID, subscription.CompanyID) {
		return
	}

	stripeLinked := subscription.StripeSubscriptionID != nil && strings.TrimSpace(*subscription.StripeSubscriptionID) != ""
	if h.paymentProvider != nil && stripeLinked {
		if err := h.paymentProvider.CancelSubscription(r.Context(), subscriptionID); err != nil {
			logger.PrintfCtx(r.Context(), "CancelSubscription (payment provider): %v", err)
			http.Error(w, "Failed to cancel subscription with payment provider", http.StatusBadGateway)
			return
		}
		updated, err := h.subscriptionRepo.FindByID(subscriptionID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Subscription not found", http.StatusNotFound)
				return
			}
			logger.PrintfCtx(r.Context(), "CancelSubscription subscriptionRepo.FindByID(%q) after provider cancel: %v", subscriptionID, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		RespondJSON(w, updated)
		return
	}

	subscription.CancelAtPeriodEnd = true
	if err := h.subscriptionRepo.Update(subscription); err != nil {
		logger.PrintfCtx(r.Context(), "CancelSubscription subscriptionRepo.Update(%q): %v", subscription.ID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
}

// maxPlanChangeRequestBodyBytes caps JSON for POST /subscriptions/plan-change-request.
const maxPlanChangeRequestBodyBytes = 4096

// PlanChangeRequestBody is JSON for POST /subscriptions/plan-change-request.
type PlanChangeRequestBody struct {
	RequestedPlanCode string `json:"requestedPlanCode"`
}

// PostPlanChangeRequest creates a Yandex Tracker issue for a requested subscription plan change (same queue as marketing leads).
// @ID           postSubscriptionPlanChangeRequest
// @Summary      Request subscription plan change (Tracker ticket)
// @Description  Authenticated company owner or billing admin; creates a Tracker work item. Plan switch is applied after manual processing.
// @Tags         subscriptions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        body  body      PlanChangeRequestBody  true  "Requested plan code"
// @Success      201   {object}  map[string]string  "Created"
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      404   {string}  string  "No subscription or company"
// @Failure      503   {string}  string  "Tracker not configured"
// @Failure      502   {string}  string  "Tracker error"
// @Router       /subscriptions/plan-change-request [post]
func (h *SubscriptionHandler) PostPlanChangeRequest(w http.ResponseWriter, r *http.Request) {
	if h.leadIssues == nil {
		http.Error(w, "Plan change requests are not configured", http.StatusServiceUnavailable)
		return
	}
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !h.requireBillingAdmin(w, r.Context(), userID, companyID) {
		return
	}
	limited := http.MaxBytesReader(w, r.Body, maxPlanChangeRequestBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req PlanChangeRequestBody
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	requested := strings.TrimSpace(req.RequestedPlanCode)
	if requested == "" {
		http.Error(w, "requestedPlanCode is required", http.StatusBadRequest)
		return
	}
	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "No subscription found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest FindByCompanyID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	currentCode := ""
	if subscription.Plan.ID != "" {
		currentCode = strings.TrimSpace(subscription.Plan.Code)
	}
	if strings.EqualFold(currentCode, requested) {
		http.Error(w, "Already on this plan", http.StatusBadRequest)
		return
	}
	if _, err := h.subscriptionRepo.FindPlanByCode(requested); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unknown or unavailable plan code", http.StatusBadRequest)
			return
		}
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest FindPlanByCode: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	user, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || user == nil {
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest FindByID user: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	userEmail := ""
	if user.Email != nil {
		userEmail = strings.TrimSpace(*user.Email)
	}
	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest companyRepo.FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	okTracker, err := h.leadIssues.LeadsConfigured(r.Context())
	if err != nil {
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest LeadsConfigured: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okTracker {
		http.Error(w, "Plan change requests are not available (Tracker or leads queue not configured)", http.StatusServiceUnavailable)
		return
	}
	err = h.leadIssues.CreatePlanChangeRequest(r.Context(),
		companyID,
		strings.TrimSpace(company.Name),
		strings.TrimSpace(company.Slug),
		strings.TrimSpace(user.Name),
		userEmail,
		currentCode,
		requested,
	)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PostPlanChangeRequest CreatePlanChangeRequest: %v", err)
		http.Error(w, "Failed to create Tracker ticket", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
}

const maxCustomTermsLeadRequestBodyBytes = 1 << 16 // 64 KiB
const maxCustomTermsCommentRunes = 8000

// CustomTermsLeadRequestBody is JSON for POST /subscriptions/custom-terms-lead-request.
type CustomTermsLeadRequestBody struct {
	Comment string `json:"comment"`
}

// PostCustomTermsLeadRequest creates a [REQ] Yandex Tracker issue (individual pricing / custom terms).
// @ID           postSubscriptionCustomTermsLeadRequest
// @Summary      Request individual pricing (marketing-style REQ ticket)
// @Description  Authenticated company owner or billing admin; comment required. User and company are taken from the session.
// @Tags         subscriptions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        body  body      CustomTermsLeadRequestBody  true  "Comment for sales"
// @Success      201   {object}  map[string]string  "Created"
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      404   {string}  string  "No company"
// @Failure      503   {string}  string  "Tracker not configured"
// @Failure      502   {string}  string  "Tracker error"
// @Router       /subscriptions/custom-terms-lead-request [post]
func (h *SubscriptionHandler) PostCustomTermsLeadRequest(w http.ResponseWriter, r *http.Request) {
	if h.leadIssues == nil {
		http.Error(w, "Lead requests are not configured", http.StatusServiceUnavailable)
		return
	}
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PostCustomTermsLeadRequest ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !h.requireBillingAdmin(w, r.Context(), userID, companyID) {
		return
	}
	limited := http.MaxBytesReader(w, r.Body, maxCustomTermsLeadRequestBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req CustomTermsLeadRequestBody
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	comment := strings.TrimSpace(req.Comment)
	if comment == "" {
		http.Error(w, "comment is required", http.StatusBadRequest)
		return
	}
	if utf8.RuneCountInString(comment) > maxCustomTermsCommentRunes {
		http.Error(w, "comment is too long", http.StatusBadRequest)
		return
	}
	user, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || user == nil {
		logger.PrintfCtx(r.Context(), "PostCustomTermsLeadRequest FindByID user: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	userEmail := ""
	if user.Email != nil {
		userEmail = strings.TrimSpace(*user.Email)
	}
	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PostCustomTermsLeadRequest companyRepo.FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	okTracker, err := h.leadIssues.LeadsConfigured(r.Context())
	if err != nil {
		logger.PrintfCtx(r.Context(), "PostCustomTermsLeadRequest LeadsConfigured: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !okTracker {
		http.Error(w, "Lead requests are not available (Tracker or leads queue not configured)", http.StatusServiceUnavailable)
		return
	}
	err = h.leadIssues.CreateTenantCustomTermsLeadRequest(r.Context(),
		companyID,
		strings.TrimSpace(company.Name),
		strings.TrimSpace(company.Slug),
		strings.TrimSpace(user.Name),
		userEmail,
		comment,
	)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PostCustomTermsLeadRequest CreateTenantCustomTermsLeadRequest: %v", err)
		http.Error(w, "Failed to create Tracker ticket", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
}
