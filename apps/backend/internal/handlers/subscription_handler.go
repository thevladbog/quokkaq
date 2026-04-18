package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/services/subscriptions"
	"quokkaq-go-backend/pkg/database"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type SubscriptionHandler struct {
	subscriptionRepo repository.SubscriptionRepository
	userRepo         repository.UserRepository
	paymentProvider  services.PaymentProvider
}

func NewSubscriptionHandler(subscriptionRepo repository.SubscriptionRepository, userRepo repository.UserRepository, paymentProvider services.PaymentProvider) *SubscriptionHandler {
	return &SubscriptionHandler{
		subscriptionRepo: subscriptionRepo,
		userRepo:         userRepo,
		paymentProvider:  paymentProvider,
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
func (h *SubscriptionHandler) requireBillingAdmin(w http.ResponseWriter, userID, companyID string) bool {
	isAdmin, err := h.userRepo.IsAdmin(userID)
	if err != nil {
		log.Printf("subscription billing auth IsAdmin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return false
	}
	if isAdmin {
		return true
	}
	isOwner, err := h.userRepo.IsCompanyOwner(userID, companyID)
	if err != nil {
		log.Printf("subscription billing auth IsCompanyOwner: %v", err)
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
		log.Printf("GetMySubscription userRepo.ResolveCompanyIDForRequest(%q): %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "No subscription found", http.StatusNotFound)
			return
		}
		log.Printf("GetMySubscription subscriptionRepo.FindByCompanyID(%q): %v", companyID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	promoted, err := subscriptions.ApplyPendingPlanIfDue(database.DB, subscription, time.Now().UTC())
	if err != nil {
		log.Printf("GetMySubscription ApplyPendingPlanIfDue: %v", err)
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
			log.Printf("GetMySubscription subscriptionRepo.FindByCompanyID reload: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
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
		log.Printf("GetPlans subscriptionRepo.GetActivePlans: %v", err)
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

	plan, err := h.subscriptionRepo.FindPlanByCode(planCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unknown plan code", http.StatusBadRequest)
			return
		}
		log.Printf("CreateCheckout subscriptionRepo.FindPlanByCode(%q): %v", planCode, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !plan.IsActive {
		http.Error(w, "Plan is not available", http.StatusBadRequest)
		return
	}
	if !plan.AllowInstantPurchase {
		http.Error(w, "This plan is not available for self-service checkout; contact sales to request access.", http.StatusConflict)
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
		log.Printf("CreateCheckout userRepo.ResolveCompanyIDForRequest(%q): %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !h.requireBillingAdmin(w, userID, companyID) {
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "No subscription found", http.StatusNotFound)
			return
		}
		log.Printf("CreateCheckout subscriptionRepo.FindByCompanyID(%q): %v", companyID, err)
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
		log.Printf("CancelSubscription subscriptionRepo.FindByID(%q): %v", subscriptionID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if !h.requireBillingAdmin(w, userID, subscription.CompanyID) {
		return
	}

	stripeLinked := subscription.StripeSubscriptionID != nil && strings.TrimSpace(*subscription.StripeSubscriptionID) != ""
	if h.paymentProvider != nil && stripeLinked {
		if err := h.paymentProvider.CancelSubscription(r.Context(), subscriptionID); err != nil {
			log.Printf("CancelSubscription (payment provider): %v", err)
			http.Error(w, "Failed to cancel subscription with payment provider", http.StatusBadGateway)
			return
		}
		updated, err := h.subscriptionRepo.FindByID(subscriptionID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Subscription not found", http.StatusNotFound)
				return
			}
			log.Printf("CancelSubscription subscriptionRepo.FindByID(%q) after provider cancel: %v", subscriptionID, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		RespondJSON(w, updated)
		return
	}

	subscription.CancelAtPeriodEnd = true
	if err := h.subscriptionRepo.Update(subscription); err != nil {
		log.Printf("CancelSubscription subscriptionRepo.Update(%q): %v", subscription.ID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
}
