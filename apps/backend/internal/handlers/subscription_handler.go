package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
)

type SubscriptionHandler struct {
	subscriptionRepo repository.SubscriptionRepository
	userRepo         repository.UserRepository
}

func NewSubscriptionHandler(subscriptionRepo repository.SubscriptionRepository, userRepo repository.UserRepository) *SubscriptionHandler {
	return &SubscriptionHandler{
		subscriptionRepo: subscriptionRepo,
		userRepo:         userRepo,
	}
}

// GetMySubscription godoc
// @Summary      Get Current User's Subscription
// @Description  Returns subscription for the authenticated user's company
// @Tags         subscriptions
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.Subscription
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No subscription found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscriptions/me [get]
func (h *SubscriptionHandler) GetMySubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get user's company through their units
	db := database.DB
	type Result struct {
		UnitID    string
		CompanyID string
	}

	var result Result
	err := db.Table("user_units").
		Select("user_units.unit_id, units.company_id").
		Joins("LEFT JOIN units ON user_units.unit_id = units.id").
		Where("user_units.user_id = ?", userID).
		First(&result).Error

	if err != nil {
		http.Error(w, "User has no associated company", http.StatusNotFound)
		return
	}

	subscription, err := h.subscriptionRepo.FindByCompanyID(result.CompanyID)
	if err != nil {
		http.Error(w, "No subscription found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
}

// GetPlans godoc
// @Summary      Get Available Subscription Plans
// @Description  Returns all active subscription plans
// @Tags         subscriptions
// @Produce      json
// @Success      200  {array}   models.SubscriptionPlan
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /subscription-plans [get]
func (h *SubscriptionHandler) GetPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.subscriptionRepo.GetActivePlans()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
// @Summary      Create Checkout Session
// @Description  Creates a checkout session for subscription upgrade
// @Tags         subscriptions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request body CreateCheckoutRequest true "Checkout Request"
// @Success      200  {object}  CreateCheckoutResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
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

	// Get user's company
	db := database.DB
	type Result struct {
		CompanyID string
	}

	var result Result
	err := db.Table("user_units").
		Select("units.company_id").
		Joins("LEFT JOIN units ON user_units.unit_id = units.id").
		Where("user_units.user_id = ?", userID).
		First(&result).Error

	if err != nil {
		http.Error(w, "User has no associated company", http.StatusNotFound)
		return
	}

	// TODO: Integrate with payment provider (Stripe/YooKassa)
	// For now, return mock checkout URL
	response := CreateCheckoutResponse{
		CheckoutURL: "/organization/billing?checkout=success",
		SessionID:   "mock-session-id",
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, response)
}

// CancelSubscription godoc
// @Summary      Cancel Subscription
// @Description  Cancels the subscription at the end of billing period
// @Tags         subscriptions
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Subscription ID"
// @Success      200  {object}  models.Subscription
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      500  {string}  string "Internal Server Error"
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
		http.Error(w, "Subscription not found", http.StatusNotFound)
		return
	}

	// Verify user has access to this subscription's company
	hasAccess, err := h.userRepo.HasCompanyAccess(userID, subscription.CompanyID)
	if err != nil || !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Mark for cancellation at period end
	subscription.CancelAtPeriodEnd = true
	if err := h.subscriptionRepo.Update(subscription); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, subscription)
}
