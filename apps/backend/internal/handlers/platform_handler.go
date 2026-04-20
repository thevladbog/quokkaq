package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const platformDefaultLimit = 50
const platformMaxLimit = 100

const platformCatalogDefaultLimit = 50
const platformCatalogMaxLimit = 200

var errPlatformCompanyAlreadyHasSubscription = errors.New("company already has a subscription")

// platformInvoiceStatuses is the allowed set for models.Invoice.Status on platform create/patch.
var platformInvoiceStatuses = map[string]struct{}{
	"draft": {}, "open": {}, "paid": {}, "void": {}, "uncollectible": {},
}

func isValidPlatformInvoiceStatus(s string) bool {
	_, ok := platformInvoiceStatuses[s]
	return ok
}

// isSubscriptionPlanSinglePromotedUniqueViolation detects conflicts on
// ux_subscription_plans_single_promoted (at most one is_promoted = true).
func isSubscriptionPlanSinglePromotedUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}
	return strings.EqualFold(pgErr.ConstraintName, "ux_subscription_plans_single_promoted")
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
func applyPlatformPatchSubscriptionCore(sub *models.Subscription, body PatchPlatformSubscriptionBody, now time.Time) error {
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

// PlatformHandler exposes SaaS operator (platform_admin) APIs.
type PlatformHandler struct {
	companyRepo      repository.CompanyRepository
	subscriptionRepo repository.SubscriptionRepository
	invoiceRepo      repository.InvoiceRepository
	catalogRepo      repository.CatalogRepository
}

func NewPlatformHandler(
	companyRepo repository.CompanyRepository,
	subscriptionRepo repository.SubscriptionRepository,
	invoiceRepo repository.InvoiceRepository,
	catalogRepo repository.CatalogRepository,
) *PlatformHandler {
	return &PlatformHandler{
		companyRepo:      companyRepo,
		subscriptionRepo: subscriptionRepo,
		invoiceRepo:      invoiceRepo,
		catalogRepo:      catalogRepo,
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

// platformParseCatalogLimitOffset matches repository/catalog max page size (200).
func platformParseCatalogLimitOffset(r *http.Request) (limit, offset int) {
	limit = platformCatalogDefaultLimit
	if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > platformCatalogMaxLimit {
		limit = platformCatalogMaxLimit
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
// @ID           ListCompanies
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
		logger.ErrorfCtx(r.Context(), "Platform ListCompanies: %v", err)
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
// @ID           GetFeatures
// @Summary      UI capability flags (DaData, etc.)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  FeaturesFlags
// @Router       /platform/features [get]
func (h *PlatformHandler) GetFeatures(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, FeaturesFlags{
		DaData:        dadataConfigured(),
		DaDataCleaner: dadataCleanerConfigured(),
	})
}

// GetSaaSOperatorCompany godoc
// @ID           GetSaaSOperatorCompany
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
		logger.ErrorfCtx(r.Context(), "Platform GetSaaSOperatorCompany: %v", err)
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
// @ID           GetCompany
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
		logger.ErrorfCtx(r.Context(), "Platform GetCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, company)
}

// PatchPlatformCompanyBody is the JSON body for PATCH /platform/companies/{id}.
type PatchPlatformCompanyBody struct {
	Name                      *string          `json:"name"`
	BillingEmail              *string          `json:"billingEmail"`
	Counterparty              *json.RawMessage `json:"counterparty" swaggertype:"object"`
	ClearCounterparty         *bool            `json:"clearCounterparty"`
	BillingAddress            *json.RawMessage `json:"billingAddress" swaggertype:"object"`
	ClearBillingAddress       *bool            `json:"clearBillingAddress"`
	PaymentAccounts           *json.RawMessage `json:"paymentAccounts" swaggertype:"array,object"`
	IsSaasOperator            *bool            `json:"isSaasOperator"`
	Slug                      *string          `json:"slug"`
	StrictPublicTenantResolve *bool            `json:"strictPublicTenantResolve"`
	OpaqueLoginLinksOnly      *bool            `json:"opaqueLoginLinksOnly"`
	SsoJitProvisioning        *bool            `json:"ssoJitProvisioning"`
	OneCCounterpartyGUID      *string          `json:"onecCounterpartyGuid"`
	ClearOneCCounterpartyGUID *bool            `json:"clearOnecCounterpartyGuid"`
	// InvoiceDefaultPaymentTerms is markdown; only allowed when patching the SaaS operator company (isSaasOperator).
	InvoiceDefaultPaymentTerms *string `json:"invoiceDefaultPaymentTerms"`
}

// PatchCompany godoc
// @ID           PatchCompany
// @Summary      Update company (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string                    true  "Company ID"
// @Param        body body  PatchPlatformCompanyBody  true  "Fields to update"
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
		logger.ErrorfCtx(r.Context(), "Platform PatchCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var body PatchPlatformCompanyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	effectiveIsSaasOperator := company.IsSaaSOperator
	if body.IsSaasOperator != nil {
		effectiveIsSaasOperator = *body.IsSaasOperator
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
		out, err := normalizeBillingAddressJSON(*body.BillingAddress)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		company.BillingAddress = out
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
	if body.PaymentAccounts != nil {
		out, err := normalizePaymentAccountsJSON(*body.PaymentAccounts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		company.PaymentAccounts = out
	}

	if body.InvoiceDefaultPaymentTerms != nil {
		if !effectiveIsSaasOperator {
			http.Error(w, "invoiceDefaultPaymentTerms can only be set on the SaaS operator company", http.StatusBadRequest)
			return
		}
		s := strings.TrimSpace(*body.InvoiceDefaultPaymentTerms)
		if utf8.RuneCountInString(s) > maxInvoicePaymentTermsRunes {
			http.Error(w, fmt.Sprintf("invoiceDefaultPaymentTerms exceeds %d characters", maxInvoicePaymentTermsRunes), http.StatusBadRequest)
			return
		}
		if s == "" {
			company.InvoiceDefaultPaymentTerms = nil
		} else {
			company.InvoiceDefaultPaymentTerms = &s
		}
	}

	if body.StrictPublicTenantResolve != nil {
		company.StrictPublicTenantResolve = *body.StrictPublicTenantResolve
	}
	if body.OpaqueLoginLinksOnly != nil {
		company.OpaqueLoginLinksOnly = *body.OpaqueLoginLinksOnly
	}
	if body.SsoJitProvisioning != nil {
		company.SsoJitProvisioning = *body.SsoJitProvisioning
	}
	if body.ClearOneCCounterpartyGUID != nil && *body.ClearOneCCounterpartyGUID {
		company.OneCCounterpartyGUID = nil
	} else if body.OneCCounterpartyGUID != nil {
		s := strings.TrimSpace(*body.OneCCounterpartyGUID)
		if s == "" {
			company.OneCCounterpartyGUID = nil
		} else {
			if len(s) > 128 {
				http.Error(w, "onecCounterpartyGuid must be at most 128 characters", http.StatusBadRequest)
				return
			}
			company.OneCCounterpartyGUID = &s
		}
	}
	if body.Slug != nil {
		n := tenantslug.Normalize(*body.Slug)
		if err := tenantslug.Validate(n); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		taken, err := h.companyRepo.IsSlugTakenByOther(n, company.ID)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if taken {
			http.Error(w, "slug already taken", http.StatusBadRequest)
			return
		}
		company.Slug = n
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
				logger.ErrorfCtx(r.Context(), "Platform PatchCompany operator tx: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		} else {
			company.IsSaaSOperator = false
			company.InvoiceDefaultPaymentTerms = nil
			if err := h.companyRepo.Update(company); err != nil {
				logger.ErrorfCtx(r.Context(), "Platform PatchCompany Update: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}
	} else {
		if err := h.companyRepo.Update(company); err != nil {
			logger.ErrorfCtx(r.Context(), "Platform PatchCompany Update: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	logger.PrintfCtx(r.Context(), "platform_admin company patch user=%s company=%s", userID, id)
	updated, err := h.companyRepo.FindByIDWithBilling(id)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "Platform PatchCompany FindByIDWithBilling: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}

// ListSubscriptions godoc
// @ID           ListSubscriptions
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
		logger.ErrorfCtx(r.Context(), "Platform ListSubscriptions: %v", err)
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

// PlatformCreateSubscriptionBody is the JSON body for POST /platform/subscriptions.
type PlatformCreateSubscriptionBody struct {
	CompanyID          string     `json:"companyId" binding:"required"`
	PlanID             string     `json:"planId" binding:"required"`
	Status             *string    `json:"status"`
	CurrentPeriodStart *time.Time `json:"currentPeriodStart"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd"`
	TrialEnd           *time.Time `json:"trialEnd"`
}

// CreateSubscription godoc
// @ID           CreateSubscription
// @Summary      Create subscription for a company without one (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body  PlatformCreateSubscriptionBody  true  "New subscription"
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

	var body PlatformCreateSubscriptionBody
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
		logger.ErrorfCtx(r.Context(), "Platform CreateSubscription FindByID company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if _, err := h.subscriptionRepo.FindPlanByID(planID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Unknown planId", http.StatusBadRequest)
			return
		}
		logger.ErrorfCtx(r.Context(), "Platform CreateSubscription FindPlanByID: %v", err)
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
		var company models.Company
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", companyID).First(&company).Error; err != nil {
			return err
		}
		if company.SubscriptionID != nil && strings.TrimSpace(*company.SubscriptionID) != "" {
			return errPlatformCompanyAlreadyHasSubscription
		}
		if err := tx.Create(sub).Error; err != nil {
			return err
		}
		return tx.Model(&models.Company{}).Where("id = ?", companyID).Update("subscription_id", sub.ID).Error
	})
	if err != nil {
		if errors.Is(err, errPlatformCompanyAlreadyHasSubscription) {
			http.Error(w, "Company already has a subscription", http.StatusConflict)
			return
		}
		logger.ErrorfCtx(r.Context(), "Platform CreateSubscription transaction: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	logger.PrintfCtx(r.Context(), "platform_admin subscription create user=%s company=%s subscription=%s plan=%s", userID, companyID, sub.ID, planID)

	created, err := h.subscriptionRepo.FindByID(sub.ID)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "Platform CreateSubscription FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSONWithStatus(w, http.StatusCreated, created)
}

// PatchPlatformSubscriptionBody is the JSON body for PATCH /platform/subscriptions/{id}.
type PatchPlatformSubscriptionBody struct {
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
func patchSubscriptionRequestsTierChange(body PatchPlatformSubscriptionBody) bool {
	if body.PlanID != nil {
		return true
	}
	if body.ClearPending != nil && *body.ClearPending {
		return true
	}
	return body.PendingPlanID != nil && body.PendingEffectiveAt != nil
}

// PatchSubscription godoc
// @ID           PatchSubscription
// @Summary      Update subscription fields (platform; may diverge from Stripe)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string                         true  "Subscription ID"
// @Param        body body  PatchPlatformSubscriptionBody  true  "Fields to update"
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
		logger.ErrorfCtx(r.Context(), "Platform PatchSubscription FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var body PatchPlatformSubscriptionBody
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
			logger.ErrorfCtx(r.Context(), "Platform PatchSubscription FindPlanByID(planId): %v", err)
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
			logger.ErrorfCtx(r.Context(), "Platform PatchSubscription FindPlanByID(pendingPlanId): %v", err)
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
		logger.ErrorfCtx(r.Context(), "Platform PatchSubscription Update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	logger.PrintfCtx(r.Context(), "platform_admin subscription patch user=%s subscription=%s", userID, id)
	updated, err := h.subscriptionRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "Platform PatchSubscription FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}

// ListSubscriptionPlans godoc
// @ID           ListSubscriptionPlans
// @Summary      List all subscription plans including inactive (platform)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.SubscriptionPlan
// @Router       /platform/subscription-plans [get]
func (h *PlatformHandler) ListSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.subscriptionRepo.ListAllPlans()
	if err != nil {
		logger.ErrorfCtx(r.Context(), "Platform ListSubscriptionPlans: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plans)
}

// PlatformCreateSubscriptionPlanBody is the JSON body for POST /platform/subscription-plans.
type PlatformCreateSubscriptionPlanBody struct {
	Name     string          `json:"name"`
	NameEn   string          `json:"nameEn"`
	Code     string          `json:"code"`
	Price    int64           `json:"price"`
	Currency string          `json:"currency"`
	Interval string          `json:"interval"`
	Features json.RawMessage `json:"features" swaggertype:"object"`
	Limits   json.RawMessage `json:"limits" swaggertype:"object"`
	IsActive bool            `json:"isActive"`
	// IsPublic omitted or null defaults to true (backward compatible).
	IsPublic *bool `json:"isPublic,omitempty"`
	// DisplayOrder omitted or null defaults to 1000 (sort last among unnamed ordering).
	DisplayOrder     *int            `json:"displayOrder,omitempty"`
	LimitsNegotiable json.RawMessage `json:"limitsNegotiable,omitempty" swaggertype:"object"`
	// AllowInstantPurchase omitted or null defaults to true.
	AllowInstantPurchase *bool `json:"allowInstantPurchase,omitempty"`
	// IsPromoted when true: this plan becomes the only promoted tier (others cleared in the same transaction).
	IsPromoted *bool `json:"isPromoted,omitempty"`
}

// CreateSubscriptionPlan godoc
// @ID           CreateSubscriptionPlan
// @Summary      Create subscription plan (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body  PlatformCreateSubscriptionPlanBody  true  "New plan"
// @Success      201  {object}  models.SubscriptionPlan
// @Router       /platform/subscription-plans [post]
func (h *PlatformHandler) CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	var body PlatformCreateSubscriptionPlanBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.NameEn = strings.TrimSpace(body.NameEn)
	body.Code = strings.ToLower(strings.TrimSpace(body.Code))
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	body.Interval = strings.ToLower(strings.TrimSpace(body.Interval))
	if body.Interval == "" {
		body.Interval = "month"
	}
	if body.Interval != "month" && body.Interval != "year" {
		http.Error(w, "interval must be month or year", http.StatusBadRequest)
		return
	}
	if body.Price < 0 {
		http.Error(w, "price must be non-negative", http.StatusBadRequest)
		return
	}
	isPublic := true
	if body.IsPublic != nil {
		isPublic = *body.IsPublic
	}
	displayOrder := 1000
	if body.DisplayOrder != nil {
		displayOrder = *body.DisplayOrder
	}
	allowInstant := true
	if body.AllowInstantPurchase != nil {
		allowInstant = *body.AllowInstantPurchase
	}
	isPromoted := false
	if body.IsPromoted != nil {
		isPromoted = *body.IsPromoted
	}
	limitsNeg := body.LimitsNegotiable
	if strings.TrimSpace(string(limitsNeg)) == "" {
		limitsNeg = json.RawMessage("{}")
	}
	plan := models.SubscriptionPlan{
		Name:                 body.Name,
		NameEn:               body.NameEn,
		Code:                 body.Code,
		Price:                body.Price,
		Currency:             body.Currency,
		Interval:             body.Interval,
		Features:             body.Features,
		Limits:               body.Limits,
		IsActive:             body.IsActive,
		IsPublic:             isPublic,
		DisplayOrder:         displayOrder,
		LimitsNegotiable:     limitsNeg,
		AllowInstantPurchase: allowInstant,
		IsPromoted:           isPromoted,
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if isPromoted {
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
				Model(&models.SubscriptionPlan{}).
				Update("is_promoted", false).Error; err != nil {
				return err
			}
		}
		return tx.Create(&plan).Error
	}); err != nil {
		logger.ErrorfCtx(r.Context(), "Platform CreateSubscriptionPlan: %v", err)
		if isSubscriptionPlanSinglePromotedUniqueViolation(err) {
			http.Error(w, "only one plan may be promoted at a time; try again", http.StatusConflict)
			return
		}
		if services.IsUniqueConstraintViolation(err) {
			http.Error(w, "Could not create plan (duplicate code?)", http.StatusBadRequest)
			return
		}
		http.Error(w, "Could not create plan", http.StatusBadRequest)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, plan)
}

// PlatformUpdateSubscriptionPlanBody is the JSON body for PUT /platform/subscription-plans/{id}.
type PlatformUpdateSubscriptionPlanBody struct {
	Name                 string          `json:"name"`
	NameEn               string          `json:"nameEn"`
	Code                 string          `json:"code"`
	Price                int64           `json:"price"`
	Currency             string          `json:"currency"`
	Interval             string          `json:"interval"`
	Features             json.RawMessage `json:"features" swaggertype:"object"`
	Limits               json.RawMessage `json:"limits" swaggertype:"object"`
	IsActive             bool            `json:"isActive"`
	IsPublic             *bool           `json:"isPublic,omitempty"`
	DisplayOrder         *int            `json:"displayOrder,omitempty"`
	LimitsNegotiable     json.RawMessage `json:"limitsNegotiable,omitempty" swaggertype:"object"`
	AllowInstantPurchase *bool           `json:"allowInstantPurchase,omitempty"`
	// IsPromoted omitted: leave unchanged. When true, other plans are demoted in the same transaction.
	IsPromoted *bool `json:"isPromoted,omitempty"`
}

// UpdateSubscriptionPlan godoc
// @ID           UpdateSubscriptionPlan
// @Summary      Replace subscription plan (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string                              true  "Plan ID"
// @Param        body body  PlatformUpdateSubscriptionPlanBody  true  "Full plan replacement"
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
		logger.ErrorfCtx(r.Context(), "Platform UpdateSubscriptionPlan FindPlanByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var body PlatformUpdateSubscriptionPlanBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.NameEn = strings.TrimSpace(body.NameEn)
	body.Code = strings.ToLower(strings.TrimSpace(body.Code))
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	body.Interval = strings.ToLower(strings.TrimSpace(body.Interval))
	if body.Interval == "" {
		body.Interval = "month"
	}
	if body.Interval != "month" && body.Interval != "year" {
		http.Error(w, "interval must be month or year", http.StatusBadRequest)
		return
	}
	if body.Price < 0 {
		http.Error(w, "price must be non-negative", http.StatusBadRequest)
		return
	}
	plan.Name = body.Name
	plan.NameEn = body.NameEn
	plan.Code = body.Code
	plan.Price = body.Price
	plan.Currency = body.Currency
	plan.Interval = body.Interval
	plan.Features = body.Features
	plan.Limits = body.Limits
	plan.IsActive = body.IsActive
	if body.IsPublic != nil {
		plan.IsPublic = *body.IsPublic
	}
	if body.DisplayOrder != nil {
		plan.DisplayOrder = *body.DisplayOrder
	}
	if body.AllowInstantPurchase != nil {
		plan.AllowInstantPurchase = *body.AllowInstantPurchase
	}
	if body.IsPromoted != nil {
		plan.IsPromoted = *body.IsPromoted
	}
	if body.LimitsNegotiable != nil {
		neg := body.LimitsNegotiable
		if strings.TrimSpace(string(neg)) == "" {
			neg = json.RawMessage("{}")
		}
		plan.LimitsNegotiable = neg
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if body.IsPromoted != nil && *body.IsPromoted {
			if err := tx.Model(&models.SubscriptionPlan{}).Where("id <> ?", id).Update("is_promoted", false).Error; err != nil {
				return err
			}
		}
		return tx.Save(plan).Error
	}); err != nil {
		logger.ErrorfCtx(r.Context(), "Platform UpdateSubscriptionPlan: %v", err)
		if isSubscriptionPlanSinglePromotedUniqueViolation(err) {
			http.Error(w, "only one plan may be promoted at a time; try again", http.StatusConflict)
			return
		}
		if services.IsUniqueConstraintViolation(err) {
			http.Error(w, "Could not update plan (duplicate code?)", http.StatusBadRequest)
			return
		}
		http.Error(w, "Could not update plan", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, plan)
}

// ListInvoices godoc
// @ID           ListInvoices
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
		logger.ErrorfCtx(r.Context(), "Platform ListInvoices: %v", err)
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

// PatchPlatformInvoiceBody is the JSON body for PATCH /platform/invoices/{id}.
type PatchPlatformInvoiceBody struct {
	Status              *string    `json:"status"`
	PaidAt              *time.Time `json:"paidAt"`
	SubscriptionID      *string    `json:"subscriptionId"`
	ClearSubscriptionID *bool      `json:"clearSubscriptionId"`
}

// PatchInvoice godoc
// @ID           PatchInvoice
// @Summary      Update invoice status (platform)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string                   true  "Invoice ID"
// @Param        body body  PatchPlatformInvoiceBody true  "Fields to update"
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
		logger.ErrorfCtx(r.Context(), "Platform PatchInvoice FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var body PatchPlatformInvoiceBody
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
			logger.ErrorfCtx(r.Context(), "Platform PatchInvoice FindSubscription: %v", err)
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

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var dbInv models.Invoice
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&dbInv, "id = ?", id).Error; err != nil {
			return err
		}
		prevStatus := strings.TrimSpace(dbInv.Status)
		prevProvider := strings.TrimSpace(dbInv.PaymentProvider)

		dbInv.Status = inv.Status
		dbInv.PaidAt = inv.PaidAt
		dbInv.SubscriptionID = inv.SubscriptionID
		if err := tx.Save(&dbInv).Error; err != nil {
			return err
		}
		manual := prevProvider == "" || prevProvider == "manual"
		becamePaid := prevStatus != "paid" && strings.TrimSpace(dbInv.Status) == "paid"
		if becamePaid && manual {
			return maybeProvisionAfterManualPaid(tx, id, time.Now().UTC())
		}
		return nil
	}); err != nil {
		logger.ErrorfCtx(r.Context(), "Platform PatchInvoice transaction: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	logger.PrintfCtx(r.Context(), "platform_admin invoice patch user=%s invoice=%s", userID, id)
	updated, err := h.invoiceRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "invoice not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "Platform PatchInvoice FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}
