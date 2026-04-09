package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const platformDefaultLimit = 50
const platformMaxLimit = 100

// platformInvoiceStatuses is the allowed set for models.Invoice.Status on platform create/patch.
var platformInvoiceStatuses = map[string]struct{}{
	"draft": {}, "open": {}, "paid": {}, "void": {}, "uncollectible": {},
}

func isValidPlatformInvoiceStatus(s string) bool {
	_, ok := platformInvoiceStatuses[s]
	return ok
}

// invoicePaidAtForCreate enforces paidAt only when status is paid; otherwise paidAt must be omitted.
func invoicePaidAtForCreate(status string, paidAt *time.Time, nowUTC time.Time) (*time.Time, error) {
	if status == "paid" {
		if paidAt != nil {
			t := paidAt.UTC()
			return &t, nil
		}
		t := nowUTC
		return &t, nil
	}
	if paidAt != nil {
		return nil, errors.New("paidAt is only allowed when status is paid")
	}
	return nil, nil
}

// platformSubscriptionStatuses is the allowed set for models.Subscription.Status on platform create/patch.
var platformSubscriptionStatuses = map[string]struct{}{
	"trial": {}, "active": {}, "past_due": {}, "canceled": {}, "paused": {},
}

// resolvePlatformSubscriptionStatusForCreate returns "active" when omitted or blank; otherwise validates against platformSubscriptionStatuses.
func resolvePlatformSubscriptionStatusForCreate(in *string) (string, error) {
	if in == nil || strings.TrimSpace(*in) == "" {
		return "active", nil
	}
	s := strings.TrimSpace(*in)
	if _, ok := platformSubscriptionStatuses[s]; !ok {
		return "", errors.New("invalid status")
	}
	return s, nil
}

// applyPlatformPatchSubscriptionCore merges status, billing window, cancel-at-period-end, and trialEnd from body into sub
// and enforces the same invariants as CreateSubscription for those fields.
func applyPlatformPatchSubscriptionCore(sub *models.Subscription, body patchSubscriptionBody, now time.Time) error {
	if (body.CurrentPeriodStart == nil) != (body.CurrentPeriodEnd == nil) {
		return errors.New("currentPeriodStart and currentPeriodEnd must both be set or both omitted")
	}
	if body.CurrentPeriodStart != nil && body.CurrentPeriodEnd != nil {
		start := body.CurrentPeriodStart.UTC()
		end := body.CurrentPeriodEnd.UTC()
		if !end.After(start) {
			return errors.New("currentPeriodEnd must be after currentPeriodStart")
		}
		sub.CurrentPeriodStart = start
		sub.CurrentPeriodEnd = end
	}

	if body.Status != nil {
		s := strings.TrimSpace(*body.Status)
		if s == "" {
			return errors.New("invalid status")
		}
		if _, ok := platformSubscriptionStatuses[s]; !ok {
			return errors.New("invalid status")
		}
		sub.Status = s
	}

	if body.CancelAtPeriodEnd != nil {
		sub.CancelAtPeriodEnd = *body.CancelAtPeriodEnd
	}

	if body.TrialEnd != nil {
		t := body.TrialEnd.UTC()
		sub.TrialEnd = &t
	}

	if sub.Status == "trial" {
		if sub.TrialEnd == nil {
			te := now.AddDate(0, 0, 14)
			sub.TrialEnd = &te
		}
		sub.CurrentPeriodEnd = *sub.TrialEnd
	}

	if !sub.CurrentPeriodEnd.After(sub.CurrentPeriodStart) {
		return errors.New("currentPeriodEnd must be after currentPeriodStart")
	}

	if sub.CancelAtPeriodEnd {
		switch sub.Status {
		case "trial", "active", "past_due":
		default:
			return errors.New("cancelAtPeriodEnd is only valid when status is trial, active, or past_due")
		}
	}

	if sub.TrialEnd != nil {
		if sub.TrialEnd.Before(sub.CurrentPeriodStart) {
			return errors.New("trialEnd must not be before currentPeriodStart")
		}
		if sub.Status == "trial" && !sub.TrialEnd.After(now) {
			return errors.New("trialEnd must be in the future for trial status")
		}
	}

	return nil
}

// platformCreateSubscriptionForCompanyTx creates a subscription for company and updates company.subscription_id to the new row (same tx).
// Allows creating multiple subscriptions per company (e.g. future periods); operator is responsible for non-overlapping periods.
func platformCreateSubscriptionForCompanyTx(tx *gorm.DB, companyID, planID string, status string, start, end time.Time, trialEnd *time.Time) (*models.Subscription, error) {
	start = start.UTC()
	end = end.UTC()
	var trialEndUTC *time.Time
	if trialEnd != nil {
		t := trialEnd.UTC()
		trialEndUTC = &t
	}

	if !end.After(start) {
		return nil, errors.New("subscription currentPeriodEnd must be after currentPeriodStart")
	}
	effectiveEnd := end
	if trialEndUTC != nil && trialEndUTC.Before(end) {
		effectiveEnd = *trialEndUTC
	}
	if !effectiveEnd.After(start) {
		return nil, errors.New("subscription period is invalid: when trialEnd is before currentPeriodEnd, trialEnd must still be after currentPeriodStart")
	}

	sub := &models.Subscription{
		CompanyID:            companyID,
		PlanID:               planID,
		Status:               status,
		CurrentPeriodStart:   start,
		CurrentPeriodEnd:     end,
		CancelAtPeriodEnd:    false,
		TrialEnd:             trialEndUTC,
		StripeSubscriptionID: nil,
	}
	if err := tx.Create(sub).Error; err != nil {
		return nil, err
	}
	if err := tx.Model(&models.Company{}).Where("id = ?", companyID).Update("subscription_id", sub.ID).Error; err != nil {
		return nil, err
	}
	return sub, nil
}

// PlatformHandler exposes SaaS operator (platform_admin) APIs.
type PlatformHandler struct {
	companyRepo      repository.CompanyRepository
	subscriptionRepo repository.SubscriptionRepository
	invoiceRepo      repository.InvoiceRepository
}

func NewPlatformHandler(
	companyRepo repository.CompanyRepository,
	subscriptionRepo repository.SubscriptionRepository,
	invoiceRepo repository.InvoiceRepository,
) *PlatformHandler {
	return &PlatformHandler{
		companyRepo:      companyRepo,
		subscriptionRepo: subscriptionRepo,
		invoiceRepo:      invoiceRepo,
	}
}

func platformParseLimitOffset(r *http.Request) (limit, offset int) {
	limit = platformDefaultLimit
	if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > platformMaxLimit {
		limit = platformMaxLimit
	}
	if v := strings.TrimSpace(r.URL.Query().Get("offset")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

type platformListResponse[T any] struct {
	Items  []T   `json:"items"`
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}

// ListCompanies godoc
// @Summary      List companies (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        search query string false "Filter by name"
// @Param        limit query int false "Page size (max 100)"
// @Param        offset query int false "Offset"
// @Success      200  {object}  platformListResponse[models.Company]
// @Router       /platform/companies [get]
func (h *PlatformHandler) ListCompanies(w http.ResponseWriter, r *http.Request) {
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	limit, offset := platformParseLimitOffset(r)
	companies, total, err := h.companyRepo.ListPaginated(search, limit, offset)
	if err != nil {
		log.Printf("Platform ListCompanies: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, platformListResponse[*models.Company]{
		Items:  toCompanyPtrSlice(companies),
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func toCompanyPtrSlice(in []models.Company) []*models.Company {
	out := make([]*models.Company, len(in))
	for i := range in {
		c := in[i]
		out[i] = &c
	}
	return out
}

// GetFeatures godoc
// @Summary      UI capability flags (DaData, etc.)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]bool
// @Router       /platform/features [get]
func (h *PlatformHandler) GetFeatures(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, map[string]bool{
		"dadata":        dadataConfigured(),
		"dadataCleaner": dadataCleanerConfigured(),
	})
}

// GetSaaSOperatorCompany godoc
// @Summary      Get the marked SaaS operator company (legal profile source for the deployment)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.Company
// @Failure      404  {string}  string "No operator company marked"
// @Router       /platform/saas-operator-company [get]
func (h *PlatformHandler) GetSaaSOperatorCompany(w http.ResponseWriter, r *http.Request) {
	c, err := h.companyRepo.FindSaaSOperatorCompany()
	if err != nil {
		log.Printf("Platform GetSaaSOperatorCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if c == nil {
		http.Error(w, "No SaaS operator company is configured", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, c)
}

// GetCompany godoc
// @Summary      Get company with billing (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Company ID"
// @Success      200  {object}  models.Company
// @Router       /platform/companies/{id} [get]
func (h *PlatformHandler) GetCompany(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	company, err := h.companyRepo.FindByIDWithBilling(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform GetCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, company)
}

type patchPlatformCompanyBody struct {
	Name                *string          `json:"name"`
	BillingEmail        *string          `json:"billingEmail"`
	Counterparty        *json.RawMessage `json:"counterparty"`
	ClearCounterparty   *bool            `json:"clearCounterparty"`
	BillingAddress      *json.RawMessage `json:"billingAddress"`
	ClearBillingAddress *bool            `json:"clearBillingAddress"`
	IsSaasOperator      *bool            `json:"isSaasOperator"`
}

// PatchCompany godoc
// @Summary      Update company (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Company ID"
// @Success      200  {object}  models.Company
// @Router       /platform/companies/{id} [patch]
func (h *PlatformHandler) PatchCompany(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	company, err := h.companyRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform PatchCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var body patchPlatformCompanyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if body.Name != nil {
		s := strings.TrimSpace(*body.Name)
		if s == "" {
			http.Error(w, "name cannot be empty", http.StatusBadRequest)
			return
		}
		company.Name = s
	}
	if body.BillingEmail != nil {
		company.BillingEmail = strings.TrimSpace(*body.BillingEmail)
	}
	if body.ClearBillingAddress != nil && *body.ClearBillingAddress {
		company.BillingAddress = nil
	} else if body.BillingAddress != nil {
		raw := *body.BillingAddress
		if len(raw) == 0 || string(raw) == "null" {
			company.BillingAddress = nil
		} else {
			company.BillingAddress = raw
		}
	}
	if body.ClearCounterparty != nil && *body.ClearCounterparty {
		company.Counterparty = nil
	} else if body.Counterparty != nil {
		raw := *body.Counterparty
		if len(raw) == 0 || string(raw) == "null" {
			company.Counterparty = nil
		} else {
			if err := validateCounterparty(raw); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			company.Counterparty = raw
		}
	}

	if body.IsSaasOperator != nil {
		if *body.IsSaasOperator {
			if err := database.DB.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&models.Company{}).Where("id <> ?", id).Update("is_saas_operator", false).Error; err != nil {
					return err
				}
				company.IsSaaSOperator = true
				return tx.Save(company).Error
			}); err != nil {
				log.Printf("Platform PatchCompany operator tx: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		} else {
			company.IsSaaSOperator = false
			if err := h.companyRepo.Update(company); err != nil {
				log.Printf("Platform PatchCompany Update: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}
	} else {
		if err := h.companyRepo.Update(company); err != nil {
			log.Printf("Platform PatchCompany Update: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	log.Printf("platform_admin company patch user=%s company=%s", userID, id)
	updated, err := h.companyRepo.FindByIDWithBilling(id)
	if err != nil {
		log.Printf("Platform PatchCompany FindByIDWithBilling: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}

// ListSubscriptions godoc
// @Summary      List all subscriptions (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        limit query int false "Page size (max 100)"
// @Param        offset query int false "Offset"
// @Success      200  {object}  platformListResponse[models.Subscription]
// @Router       /platform/subscriptions [get]
func (h *PlatformHandler) ListSubscriptions(w http.ResponseWriter, r *http.Request) {
	limit, offset := platformParseLimitOffset(r)
	subs, total, err := h.subscriptionRepo.ListAllPaginated(limit, offset)
	if err != nil {
		log.Printf("Platform ListSubscriptions: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, platformListResponse[*models.Subscription]{
		Items:  toSubscriptionPtrSlice(subs),
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func toSubscriptionPtrSlice(in []models.Subscription) []*models.Subscription {
	out := make([]*models.Subscription, len(in))
	for i := range in {
		s := in[i]
		out[i] = &s
	}
	return out
}

type createSubscriptionBody struct {
	CompanyID          string     `json:"companyId"`
	PlanID             string     `json:"planId"`
	Status             *string    `json:"status"`
	CurrentPeriodStart *time.Time `json:"currentPeriodStart"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd"`
	TrialEnd           *time.Time `json:"trialEnd"`
}

// CreateSubscription godoc
// @Summary      Create subscription for a company without one (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      201  {object}  models.Subscription
// @Failure      400  {string}  string "Bad request"
// @Failure      404  {string}  string "Company not found"
// @Failure      409  {string}  string "Company already has a subscription"
// @Router       /platform/subscriptions [post]
func (h *PlatformHandler) CreateSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body createSubscriptionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	companyID := strings.TrimSpace(body.CompanyID)
	planID := strings.TrimSpace(body.PlanID)
	if companyID == "" || planID == "" {
		http.Error(w, "companyId and planId are required", http.StatusBadRequest)
		return
	}

	if _, err := h.companyRepo.FindByID(companyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform CreateSubscription FindByID company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if _, err := h.subscriptionRepo.FindPlanByID(planID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unknown planId", http.StatusBadRequest)
			return
		}
		log.Printf("Platform CreateSubscription FindPlanByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if (body.CurrentPeriodStart == nil) != (body.CurrentPeriodEnd == nil) {
		http.Error(w, "currentPeriodStart and currentPeriodEnd must both be set or both omitted", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	start := now
	end := now.AddDate(0, 1, 0)
	if body.CurrentPeriodStart != nil && body.CurrentPeriodEnd != nil {
		start = body.CurrentPeriodStart.UTC()
		end = body.CurrentPeriodEnd.UTC()
		if !end.After(start) {
			http.Error(w, "currentPeriodEnd must be after currentPeriodStart", http.StatusBadRequest)
			return
		}
	}

	status, err := resolvePlatformSubscriptionStatusForCreate(body.Status)
	if err != nil {
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	var trialEnd *time.Time
	if body.TrialEnd != nil {
		t := body.TrialEnd.UTC()
		trialEnd = &t
	}
	if status == "trial" {
		if trialEnd == nil {
			te := now.AddDate(0, 0, 14)
			trialEnd = &te
		}
		end = *trialEnd
	}
	if trialEnd != nil {
		if trialEnd.Before(start) {
			http.Error(w, "trialEnd must not be before currentPeriodStart", http.StatusBadRequest)
			return
		}
		if status == "trial" && !trialEnd.After(now) {
			http.Error(w, "trialEnd must be in the future for trial status", http.StatusBadRequest)
			return
		}
	}

	sub := &models.Subscription{
		CompanyID:            companyID,
		PlanID:               planID,
		Status:               status,
		CurrentPeriodStart:   start,
		CurrentPeriodEnd:     end,
		CancelAtPeriodEnd:    false,
		TrialEnd:             trialEnd,
		StripeSubscriptionID: nil,
	}

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(sub).Error; err != nil {
			return err
		}
		return tx.Model(&models.Company{}).Where("id = ?", companyID).Update("subscription_id", sub.ID).Error
	})
	if err != nil {
		log.Printf("Platform CreateSubscription transaction: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("platform_admin subscription create user=%s company=%s subscription=%s plan=%s", userID, companyID, sub.ID, planID)

	created, err := h.subscriptionRepo.FindByID(sub.ID)
	if err != nil {
		log.Printf("Platform CreateSubscription FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSONWithStatus(w, http.StatusCreated, created)
}

type patchSubscriptionBody struct {
	Status             *string    `json:"status"`
	CurrentPeriodStart *time.Time `json:"currentPeriodStart"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd"`
	CancelAtPeriodEnd  *bool      `json:"cancelAtPeriodEnd"`
	TrialEnd           *time.Time `json:"trialEnd"`
	PlanID             *string    `json:"planId"`
	PendingPlanID      *string    `json:"pendingPlanId"`
	PendingEffectiveAt *time.Time `json:"pendingEffectiveAt"`
	ClearPending       *bool      `json:"clearPending"`
}

func subscriptionStripeLinked(sub *models.Subscription) bool {
	return sub.StripeSubscriptionID != nil && strings.TrimSpace(*sub.StripeSubscriptionID) != ""
}

// patchSubscriptionRequestsTierChange is true when the body attempts to change plan, schedule a plan, or clear a scheduled plan.
func patchSubscriptionRequestsTierChange(body patchSubscriptionBody) bool {
	if body.PlanID != nil {
		return true
	}
	if body.ClearPending != nil && *body.ClearPending {
		return true
	}
	return body.PendingPlanID != nil && body.PendingEffectiveAt != nil
}

// PatchSubscription godoc
// @Summary      Update subscription fields (platform; may diverge from Stripe)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Subscription ID"
// @Success      200  {object}  models.Subscription
// @Router       /platform/subscriptions/{id} [patch]
func (h *PlatformHandler) PatchSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	sub, err := h.subscriptionRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform PatchSubscription FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var body patchSubscriptionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if subscriptionStripeLinked(sub) && patchSubscriptionRequestsTierChange(body) {
		http.Error(w, "subscription is linked to Stripe; change plan in Stripe or unlink first", http.StatusConflict)
		return
	}

	now := time.Now().UTC()
	if err := applyPlatformPatchSubscriptionCore(sub, body, now); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if body.PlanID != nil {
		pid := strings.TrimSpace(*body.PlanID)
		if pid == "" {
			http.Error(w, "planId must not be empty", http.StatusBadRequest)
			return
		}
		if _, err := h.subscriptionRepo.FindPlanByID(pid); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Unknown planId", http.StatusBadRequest)
				return
			}
			log.Printf("Platform PatchSubscription FindPlanByID(planId): %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		sub.PlanID = pid
		sub.PendingPlanID = nil
		sub.PendingEffectiveAt = nil
		sub.PendingPlan = nil
	}

	scheduling := body.PendingPlanID != nil && body.PendingEffectiveAt != nil
	partialPending := (body.PendingPlanID != nil || body.PendingEffectiveAt != nil) && !scheduling
	if partialPending {
		http.Error(w, "pendingPlanId and pendingEffectiveAt must both be set", http.StatusBadRequest)
		return
	}

	if scheduling {
		ppid := strings.TrimSpace(*body.PendingPlanID)
		if ppid == "" {
			http.Error(w, "pendingPlanId must not be empty", http.StatusBadRequest)
			return
		}
		if _, err := h.subscriptionRepo.FindPlanByID(ppid); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Unknown pendingPlanId", http.StatusBadRequest)
				return
			}
			log.Printf("Platform PatchSubscription FindPlanByID(pendingPlanId): %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		t := body.PendingEffectiveAt.UTC()
		if !t.After(now) {
			http.Error(w, "pendingEffectiveAt must be in the future (UTC)", http.StatusBadRequest)
			return
		}
		sub.PendingPlanID = &ppid
		sub.PendingEffectiveAt = &t
		sub.PendingPlan = nil
	} else if body.ClearPending != nil && *body.ClearPending {
		sub.PendingPlanID = nil
		sub.PendingEffectiveAt = nil
		sub.PendingPlan = nil
	}

	if err := h.subscriptionRepo.Update(sub); err != nil {
		log.Printf("Platform PatchSubscription Update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("platform_admin subscription patch user=%s subscription=%s", userID, id)
	updated, _ := h.subscriptionRepo.FindByID(id)
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}

// ListSubscriptionPlans godoc
// @Summary      List all subscription plans including inactive (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.SubscriptionPlan
// @Router       /platform/subscription-plans [get]
func (h *PlatformHandler) ListSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.subscriptionRepo.ListAllPlans()
	if err != nil {
		log.Printf("Platform ListSubscriptionPlans: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plans)
}

type createPlanBody struct {
	Name     string          `json:"name"`
	Code     string          `json:"code"`
	Price    int64           `json:"price"`
	Currency string          `json:"currency"`
	Interval string          `json:"interval"`
	Features json.RawMessage `json:"features"`
	Limits   json.RawMessage `json:"limits"`
	IsActive bool            `json:"isActive"`
}

// CreateSubscriptionPlan godoc
// @Summary      Create subscription plan (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      201  {object}  models.SubscriptionPlan
// @Router       /platform/subscription-plans [post]
func (h *PlatformHandler) CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	var body createPlanBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Code = strings.ToLower(strings.TrimSpace(body.Code))
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	if body.Interval == "" {
		body.Interval = "month"
	}
	plan := models.SubscriptionPlan{
		Name:     body.Name,
		Code:     body.Code,
		Price:    body.Price,
		Currency: body.Currency,
		Interval: body.Interval,
		Features: body.Features,
		Limits:   body.Limits,
		IsActive: body.IsActive,
	}
	if err := h.subscriptionRepo.CreatePlan(&plan); err != nil {
		log.Printf("Platform CreateSubscriptionPlan: %v", err)
		http.Error(w, "Could not create plan (duplicate code?)", http.StatusBadRequest)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, plan)
}

type updatePlanBody struct {
	Name     string          `json:"name"`
	Code     string          `json:"code"`
	Price    int64           `json:"price"`
	Currency string          `json:"currency"`
	Interval string          `json:"interval"`
	Features json.RawMessage `json:"features"`
	Limits   json.RawMessage `json:"limits"`
	IsActive bool            `json:"isActive"`
}

// UpdateSubscriptionPlan godoc
// @Summary      Replace subscription plan (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Plan ID"
// @Success      200  {object}  models.SubscriptionPlan
// @Router       /platform/subscription-plans/{id} [put]
func (h *PlatformHandler) UpdateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	plan, err := h.subscriptionRepo.FindPlanByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform UpdateSubscriptionPlan FindPlanByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var body updatePlanBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Code = strings.ToLower(strings.TrimSpace(body.Code))
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	if body.Interval == "" {
		body.Interval = "month"
	}
	plan.Name = body.Name
	plan.Code = body.Code
	plan.Price = body.Price
	plan.Currency = body.Currency
	plan.Interval = body.Interval
	plan.Features = body.Features
	plan.Limits = body.Limits
	plan.IsActive = body.IsActive
	if err := h.subscriptionRepo.UpdatePlan(plan); err != nil {
		log.Printf("Platform UpdateSubscriptionPlan: %v", err)
		http.Error(w, "Could not update plan", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plan)
}

// ListInvoices godoc
// @Summary      List invoices (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        companyId query string false "Filter by company"
// @Param        limit query int false "Page size (max 100)"
// @Param        offset query int false "Offset"
// @Success      200  {object}  platformListResponse[models.Invoice]
// @Router       /platform/invoices [get]
func (h *PlatformHandler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	limit, offset := platformParseLimitOffset(r)
	var companyID *string
	if v := strings.TrimSpace(r.URL.Query().Get("companyId")); v != "" {
		companyID = &v
	}
	invoices, total, err := h.invoiceRepo.ListPaginated(companyID, limit, offset)
	if err != nil {
		log.Printf("Platform ListInvoices: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, platformListResponse[*models.Invoice]{
		Items:  toInvoicePtrSlice(invoices),
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func toInvoicePtrSlice(in []models.Invoice) []*models.Invoice {
	out := make([]*models.Invoice, len(in))
	for i := range in {
		inv := in[i]
		out[i] = &inv
	}
	return out
}

type createInvoiceSubscriptionOpts struct {
	PlanID               string     `json:"planId"`
	CurrentPeriodStart   *time.Time `json:"currentPeriodStart"`
	CurrentPeriodEnd     *time.Time `json:"currentPeriodEnd"`
	Status               *string    `json:"status"`
	TrialEnd             *time.Time `json:"trialEnd"`
}

type createInvoiceBody struct {
	CompanyID                     string                         `json:"companyId"`
	SubscriptionID                string                         `json:"subscriptionId"`
	Amount                        int64                          `json:"amount"`
	Currency                      string                         `json:"currency"`
	DueDate                       string                         `json:"dueDate"` // RFC3339
	Status                        string                         `json:"status"`
	PaidAt                        *time.Time                     `json:"paidAt,omitempty"`
	PaymentProvider               string                         `json:"paymentProvider"`
	CreateSubscriptionWithInvoice bool                           `json:"createSubscriptionWithInvoice"`
	Subscription                  *createInvoiceSubscriptionOpts `json:"subscription"`
}

// CreateInvoice godoc
// @Summary      Create manual invoice (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      201  {object}  models.Invoice
// @Router       /platform/invoices [post]
func (h *PlatformHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var body createInvoiceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.CompanyID = strings.TrimSpace(body.CompanyID)
	body.SubscriptionID = strings.TrimSpace(body.SubscriptionID)
	if body.CompanyID == "" {
		http.Error(w, "companyId is required", http.StatusBadRequest)
		return
	}
	if _, err := h.companyRepo.FindByID(body.CompanyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform CreateInvoice FindByID company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if body.Amount <= 0 {
		http.Error(w, "amount must be positive", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	body.Status = strings.TrimSpace(body.Status)
	if body.Status == "" {
		body.Status = "open"
	}
	if body.PaymentProvider == "" {
		body.PaymentProvider = "manual"
	}
	if !isValidPlatformInvoiceStatus(body.Status) {
		http.Error(w, "invalid invoice status", http.StatusBadRequest)
		return
	}
	nowUTC := time.Now().UTC()
	paidAtPtr, err := invoicePaidAtForCreate(body.Status, body.PaidAt, nowUTC)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	due, err := time.Parse(time.RFC3339, strings.TrimSpace(body.DueDate))
	if err != nil {
		http.Error(w, "dueDate must be RFC3339", http.StatusBadRequest)
		return
	}

	withSub := body.CreateSubscriptionWithInvoice
	explicitSubID := body.SubscriptionID
	if withSub && explicitSubID != "" {
		http.Error(w, "cannot set subscriptionId when createSubscriptionWithInvoice is true", http.StatusBadRequest)
		return
	}

	cid := body.CompanyID
	var createdInv *models.Invoice

	if withSub {
		if body.Subscription == nil {
			http.Error(w, "subscription options required when createSubscriptionWithInvoice is true", http.StatusBadRequest)
			return
		}
		planID := strings.TrimSpace(body.Subscription.PlanID)
		if planID == "" {
			http.Error(w, "subscription.planId is required", http.StatusBadRequest)
			return
		}
		if body.Subscription.CurrentPeriodStart == nil || body.Subscription.CurrentPeriodEnd == nil {
			http.Error(w, "subscription.currentPeriodStart and subscription.currentPeriodEnd are required", http.StatusBadRequest)
			return
		}
		start := body.Subscription.CurrentPeriodStart.UTC()
		end := body.Subscription.CurrentPeriodEnd.UTC()
		if !end.After(start) {
			http.Error(w, "subscription period end must be after start", http.StatusBadRequest)
			return
		}
		if _, err := h.subscriptionRepo.FindPlanByID(planID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Unknown subscription.planId", http.StatusBadRequest)
				return
			}
			log.Printf("Platform CreateInvoice FindPlanByID: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		status, err := resolvePlatformSubscriptionStatusForCreate(body.Subscription.Status)
		if err != nil {
			http.Error(w, "invalid subscription.status", http.StatusBadRequest)
			return
		}

		now := time.Now().UTC()
		var trialEnd *time.Time
		if body.Subscription.TrialEnd != nil {
			t := body.Subscription.TrialEnd.UTC()
			trialEnd = &t
		}
		if status == "trial" {
			if trialEnd == nil {
				te := now.AddDate(0, 0, 14)
				trialEnd = &te
			}
			end = *trialEnd
		}
		if trialEnd != nil {
			if trialEnd.Before(start) {
				http.Error(w, "subscription.trialEnd must not be before currentPeriodStart", http.StatusBadRequest)
				return
			}
			if status == "trial" && !trialEnd.After(now) {
				http.Error(w, "subscription.trialEnd must be in the future for trial status", http.StatusBadRequest)
				return
			}
		}

		var inv models.Invoice
		err = database.DB.Transaction(func(tx *gorm.DB) error {
			sub, err := platformCreateSubscriptionForCompanyTx(tx, body.CompanyID, planID, status, start, end, trialEnd)
			if err != nil {
				return err
			}
			sid := sub.ID
			inv = models.Invoice{
				CompanyID:       &cid,
				SubscriptionID:  &sid,
				Amount:          body.Amount,
				Currency:        body.Currency,
				Status:          body.Status,
				PaymentProvider: body.PaymentProvider,
				PaidAt:          paidAtPtr,
				DueDate:         due,
			}
			return tx.Create(&inv).Error
		})
		if err != nil {
			log.Printf("Platform CreateInvoice transaction (with subscription): %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		createdInv = &inv
	} else {
		var subIDPtr *string
		if explicitSubID != "" {
			sub, err := h.subscriptionRepo.FindByID(explicitSubID)
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					http.Error(w, "subscription not found", http.StatusBadRequest)
					return
				}
				log.Printf("Platform CreateInvoice FindSubscription: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if sub.CompanyID != body.CompanyID {
				http.Error(w, "subscription does not belong to company", http.StatusBadRequest)
				return
			}
			subIDPtr = &explicitSubID
		}

		inv := models.Invoice{
			CompanyID:       &cid,
			SubscriptionID:  subIDPtr,
			Amount:          body.Amount,
			Currency:        body.Currency,
			Status:          body.Status,
			PaymentProvider: body.PaymentProvider,
			PaidAt:          paidAtPtr,
			DueDate:         due,
		}
		if err := h.invoiceRepo.Create(&inv); err != nil {
			log.Printf("Platform CreateInvoice: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		createdInv = &inv
	}

	log.Printf("platform_admin invoice create user=%s invoice=%s company=%s", userID, createdInv.ID, body.CompanyID)
	out, err := h.invoiceRepo.FindByID(createdInv.ID)
	if err != nil {
		log.Printf("Platform CreateInvoice FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, out)
}

type patchInvoiceBody struct {
	Status              *string    `json:"status"`
	PaidAt              *time.Time `json:"paidAt"`
	SubscriptionID      *string    `json:"subscriptionId"`
	ClearSubscriptionID *bool      `json:"clearSubscriptionId"`
}

// PatchInvoice godoc
// @Summary      Update invoice status (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Invoice ID"
// @Success      200  {object}  models.Invoice
// @Router       /platform/invoices/{id} [patch]
func (h *PlatformHandler) PatchInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	inv, err := h.invoiceRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("Platform PatchInvoice FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var body patchInvoiceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Status != nil {
		st := strings.TrimSpace(*body.Status)
		if !isValidPlatformInvoiceStatus(st) {
			http.Error(w, "invalid invoice status", http.StatusBadRequest)
			return
		}
		inv.Status = st
		if st == "paid" {
			if body.PaidAt != nil {
				t := body.PaidAt.UTC()
				inv.PaidAt = &t
			} else if inv.PaidAt == nil {
				now := time.Now().UTC()
				inv.PaidAt = &now
			}
		} else {
			inv.PaidAt = nil
		}
	} else if body.PaidAt != nil {
		if strings.TrimSpace(inv.Status) != "paid" {
			http.Error(w, "paidAt may only be set when invoice status is paid", http.StatusBadRequest)
			return
		}
		t := body.PaidAt.UTC()
		inv.PaidAt = &t
	}

	wantClear := body.ClearSubscriptionID != nil && *body.ClearSubscriptionID
	var newSubID string
	if body.SubscriptionID != nil {
		newSubID = strings.TrimSpace(*body.SubscriptionID)
	}
	if wantClear && newSubID != "" {
		http.Error(w, "cannot set subscriptionId and clearSubscriptionId together", http.StatusBadRequest)
		return
	}
	if wantClear {
		if inv.PaymentProvider != "manual" {
			http.Error(w, "clearing subscription link is only allowed for manual invoices", http.StatusBadRequest)
			return
		}
		inv.SubscriptionID = nil
	} else if newSubID != "" {
		if inv.CompanyID == nil || strings.TrimSpace(*inv.CompanyID) == "" {
			http.Error(w, "invoice has no company; cannot link subscription", http.StatusBadRequest)
			return
		}
		sub, err := h.subscriptionRepo.FindByID(newSubID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "subscription not found", http.StatusBadRequest)
				return
			}
			log.Printf("Platform PatchInvoice FindSubscription: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if sub.CompanyID != *inv.CompanyID {
			http.Error(w, "subscription does not belong to invoice company", http.StatusBadRequest)
			return
		}
		sid := newSubID
		inv.SubscriptionID = &sid
	}

	if err := h.invoiceRepo.Update(inv); err != nil {
		log.Printf("Platform PatchInvoice Update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("platform_admin invoice patch user=%s invoice=%s", userID, id)
	updated, _ := h.invoiceRepo.FindByID(id)
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}
