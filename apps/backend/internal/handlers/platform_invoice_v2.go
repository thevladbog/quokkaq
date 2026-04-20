package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strings"
	"time"
	"unicode/utf8"

	"quokkaq-go-backend/internal/invoicing"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	errPlatformInvoiceNotDraft  = errors.New("platform invoice not in draft status")
	errIssueInvoiceConflict     = errors.New("invoice issue conflict: status changed concurrently")
	errInvoiceNoLinesForIssue   = errors.New("invoice has no lines")
	errInvoiceNoCompanyForIssue = errors.New("invoice has no company")
)

const maxInvoicePaymentTermsRunes = 32000
const maxInvoiceLineCommentRunes = 512

// InvoiceDraftLineInput is one line in a platform invoice draft create/patch request.
type InvoiceDraftLineInput struct {
	CatalogItemID    *string `json:"catalogItemId"`
	DescriptionPrint string  `json:"descriptionPrint"`
	// LineComment is optional text shown under the line title in print (parentheses in UI/PDF).
	LineComment string  `json:"lineComment"`
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"` // UOM; if empty and catalog linked, defaults from catalog
	// If nil with a catalog line, defaults to catalog default price; if non-nil (including *0), that value is used as-is.
	UnitPriceInclVatMinor   *int64     `json:"unitPriceInclVatMinor,omitempty"`
	DiscountPercent         *float64   `json:"discountPercent"`
	DiscountAmountMinor     *int64     `json:"discountAmountMinor"`
	VatExempt               *bool      `json:"vatExempt"`
	VatRatePercent          *float64   `json:"vatRatePercent"`
	SubscriptionPlanID      *string    `json:"subscriptionPlanId"`
	SubscriptionPeriodStart *time.Time `json:"subscriptionPeriodStart"`
}

// InvoiceDraftUpsertBody is the JSON body for PATCH /platform/invoices/{id}/draft (companyId in JSON is ignored).
type InvoiceDraftUpsertBody struct {
	DueDate                  string `json:"dueDate" binding:"required"` // RFC3339
	Currency                 string `json:"currency"`
	AllowYookassaPaymentLink bool   `json:"allowYookassaPaymentLink"`
	// Stripe Checkout for platform invoices is not wired end-to-end yet; the flag is stored for future use and API symmetry with YooKassa.
	AllowStripePaymentLink          bool `json:"allowStripePaymentLink"`
	ProvisionSubscriptionsOnPayment bool `json:"provisionSubscriptionsOnPayment"`
	// PaymentTerms is optional markdown for «Условия оплаты». Omit on PATCH to leave unchanged; send "" to clear.
	PaymentTerms *string                 `json:"paymentTerms"`
	Lines        []InvoiceDraftLineInput `json:"lines" binding:"required,min=1"`
}

// InvoiceDraftCreateBody is the JSON body for POST /platform/invoices.
type InvoiceDraftCreateBody struct {
	CompanyID string `json:"companyId" binding:"required"`
	InvoiceDraftUpsertBody
}

func normalizeInvoiceLineComment(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '(' && s[len(s)-1] == ')' {
		return strings.TrimSpace(s[1 : len(s)-1])
	}
	return s
}

func licensePeriodEnd(start time.Time, qty float64, interval string) time.Time {
	n := int(math.Round(qty))
	if n < 1 {
		n = 1
	}
	switch strings.ToLower(strings.TrimSpace(interval)) {
	case "year":
		return start.AddDate(n, 0, 0)
	default:
		return start.AddDate(0, n, 0)
	}
}

func (h *PlatformHandler) buildDraftLines(inputs []InvoiceDraftLineInput) ([]models.InvoiceLine, int64, int64, int64, error) {
	if len(inputs) == 0 {
		return nil, 0, 0, 0, errors.New("at least one line is required")
	}
	licenseRows := 0
	lines := make([]models.InvoiceLine, 0, len(inputs))
	var totalNet, totalVat, totalGross int64

	for _, in := range inputs {
		vatExempt := false
		if in.VatExempt != nil {
			vatExempt = *in.VatExempt
		}
		vatRate := 0.0
		if in.VatRatePercent != nil {
			vatRate = *in.VatRatePercent
		}
		desc := strings.TrimSpace(in.DescriptionPrint)
		var priceMinor int64
		if in.UnitPriceInclVatMinor != nil {
			priceMinor = *in.UnitPriceInclVatMinor
		}
		qty := in.Quantity

		var catID *string
		var catalogItem *models.CatalogItem
		if in.CatalogItemID != nil {
			s := strings.TrimSpace(*in.CatalogItemID)
			if s != "" {
				cat, err := h.catalogRepo.FindByID(s)
				if err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return nil, 0, 0, 0, errors.New("unknown catalogItemId")
					}
					return nil, 0, 0, 0, err
				}
				catalogItem = cat
				catID = &s
				if desc == "" {
					desc = strings.TrimSpace(cat.PrintName)
					if desc == "" {
						desc = cat.Name
					}
				}
				if in.UnitPriceInclVatMinor == nil {
					priceMinor = cat.DefaultPriceMinor
				}
				if in.VatExempt == nil {
					vatExempt = cat.VatExempt
				}
				if in.VatRatePercent == nil {
					vatRate = cat.VatRatePercent
				}
			}
		}

		lineUnit := strings.TrimSpace(in.Unit)
		if lineUnit == "" && catalogItem != nil {
			lineUnit = strings.TrimSpace(catalogItem.Unit)
		}
		if desc == "" {
			return nil, 0, 0, 0, errors.New("descriptionPrint is required when no catalog item")
		}

		cmt := normalizeInvoiceLineComment(in.LineComment)
		if utf8.RuneCountInString(cmt) > maxInvoiceLineCommentRunes {
			return nil, 0, 0, 0, fmt.Errorf("lineComment exceeds %d characters", maxInvoiceLineCommentRunes)
		}

		var planID *string
		if in.SubscriptionPlanID != nil {
			p := strings.TrimSpace(*in.SubscriptionPlanID)
			if p != "" {
				planID = &p
				licenseRows++
			}
		}
		if licenseRows > 1 {
			return nil, 0, 0, 0, errors.New("at most one line may reference a subscription plan")
		}

		var subStart, subEnd *time.Time
		if planID != nil {
			if in.SubscriptionPeriodStart == nil {
				return nil, 0, 0, 0, errors.New("subscriptionPeriodStart required for subscription lines")
			}
			plan, err := h.subscriptionRepo.FindPlanByID(*planID)
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return nil, 0, 0, 0, errors.New("unknown subscriptionPlanId")
				}
				return nil, 0, 0, 0, err
			}
			st := in.SubscriptionPeriodStart.UTC()
			subStart = &st
			en := licensePeriodEnd(st, qty, plan.Interval)
			subEnd = &en
		}

		tot, err := invoicing.ComputeLine(invoicing.LineInput{
			UnitPriceInclVatMinor: priceMinor,
			Quantity:              qty,
			DiscountPercent:       in.DiscountPercent,
			DiscountAmountMinor:   in.DiscountAmountMinor,
			VatExempt:             vatExempt,
			VatRatePercent:        vatRate,
		})
		if err != nil {
			return nil, 0, 0, 0, err
		}

		line := models.InvoiceLine{
			CatalogItemID:           catID,
			DescriptionPrint:        desc,
			LineComment:             cmt,
			Quantity:                qty,
			MeasureUnit:             lineUnit,
			UnitPriceInclVatMinor:   priceMinor,
			DiscountPercent:         in.DiscountPercent,
			DiscountAmountMinor:     in.DiscountAmountMinor,
			VatExempt:               vatExempt,
			VatRatePercent:          vatRate,
			LineNetMinor:            tot.LineNetMinor,
			VatAmountMinor:          tot.VatAmountMinor,
			LineGrossMinor:          tot.LineGrossMinor,
			SubscriptionPlanID:      planID,
			SubscriptionPeriodStart: subStart,
			SubscriptionPeriodEnd:   subEnd,
		}
		lines = append(lines, line)
		totalNet += tot.LineNetMinor
		totalVat += tot.VatAmountMinor
		totalGross += tot.LineGrossMinor
	}
	return lines, totalNet, totalVat, totalGross, nil
}

// upsertDraftInvoiceInTx loads the invoice row with FOR UPDATE, requires status draft, then replaces header totals and lines.
func (h *PlatformHandler) upsertDraftInvoiceInTx(tx *gorm.DB, invoiceID string, body InvoiceDraftUpsertBody) error {
	var inv models.Invoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		First(&inv, "id = ?", invoiceID).Error; err != nil {
		return err
	}
	if inv.Status != "draft" {
		return errPlatformInvoiceNotDraft
	}
	if inv.CompanyID == nil {
		return errors.New("invoice has no company")
	}
	if strings.TrimSpace(body.Currency) == "" {
		body.Currency = inv.Currency
	}
	lines, net, vat, gross, err := h.buildDraftLines(body.Lines)
	if err != nil {
		return err
	}
	inv.SubtotalExclVatMinor = net
	inv.VatTotalMinor = vat
	inv.Amount = gross
	inv.AllowYookassaPaymentLink = body.AllowYookassaPaymentLink
	inv.AllowStripePaymentLink = body.AllowStripePaymentLink
	inv.ProvisionSubscriptionsOnPayment = body.ProvisionSubscriptionsOnPayment
	due, err := time.Parse(time.RFC3339, strings.TrimSpace(body.DueDate))
	if err != nil {
		return errors.New("dueDate must be RFC3339")
	}
	inv.DueDate = due.UTC()
	if strings.TrimSpace(body.Currency) != "" {
		inv.Currency = strings.TrimSpace(body.Currency)
	}
	if body.PaymentTerms != nil {
		t := strings.TrimSpace(*body.PaymentTerms)
		if t == "" {
			inv.PaymentTermsMarkdown = nil
		} else {
			if utf8.RuneCountInString(t) > maxInvoicePaymentTermsRunes {
				return fmt.Errorf("paymentTerms exceeds %d characters", maxInvoicePaymentTermsRunes)
			}
			inv.PaymentTermsMarkdown = &t
		}
	}
	return h.invoiceRepo.UpdateHeaderAndLinesInTx(tx, &inv, lines)
}

// CreateInvoice godoc
// @ID           PlatformCreateInvoice
// @Summary      Create draft invoice (platform)
// @Description  Creates a multi-line draft invoice for a company. companyId and dueDate (RFC3339) are required; at least one line.
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      InvoiceDraftCreateBody  true  "Draft invoice payload"
// @Success      201   {object}  models.Invoice
// @Failure      400   {string}  string "Bad request"
// @Failure      401   {string}  string "Unauthorized"
// @Failure      403   {string}  string "Forbidden"
// @Failure      404   {string}  string "Company not found"
// @Failure      500   {string}  string "Internal server error"
// @Router       /platform/invoices [post]
func (h *PlatformHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var body InvoiceDraftCreateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.CompanyID = strings.TrimSpace(body.CompanyID)
	if body.CompanyID == "" {
		http.Error(w, "companyId is required", http.StatusBadRequest)
		return
	}
	if _, err := h.companyRepo.FindByID(body.CompanyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "CreateInvoice Find company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if body.Currency == "" {
		body.Currency = "RUB"
	}
	cid := body.CompanyID
	lines, net, vat, gross, err := h.buildDraftLines(body.Lines)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	due, err := time.Parse(time.RFC3339, strings.TrimSpace(body.DueDate))
	if err != nil {
		http.Error(w, "dueDate must be RFC3339", http.StatusBadRequest)
		return
	}

	inv := models.Invoice{
		CompanyID:                       &cid,
		Status:                          "draft",
		Currency:                        body.Currency,
		DueDate:                         due.UTC(),
		PaymentProvider:                 "manual",
		SubtotalExclVatMinor:            net,
		VatTotalMinor:                   vat,
		Amount:                          gross,
		AllowYookassaPaymentLink:        body.AllowYookassaPaymentLink,
		AllowStripePaymentLink:          body.AllowStripePaymentLink,
		ProvisionSubscriptionsOnPayment: body.ProvisionSubscriptionsOnPayment,
	}
	if body.PaymentTerms != nil {
		t := strings.TrimSpace(*body.PaymentTerms)
		if utf8.RuneCountInString(t) > maxInvoicePaymentTermsRunes {
			http.Error(w, fmt.Sprintf("paymentTerms exceeds %d characters", maxInvoicePaymentTermsRunes), http.StatusBadRequest)
			return
		}
		inv.PaymentTermsMarkdown = &t
	}
	if inv.PaymentTermsMarkdown == nil {
		op, errOp := h.companyRepo.FindSaaSOperatorCompany()
		if errOp != nil {
			logger.ErrorfCtx(r.Context(), "CreateInvoice FindSaaSOperatorCompany: %v", errOp)
		} else if op != nil && op.InvoiceDefaultPaymentTerms != nil {
			t := strings.TrimSpace(*op.InvoiceDefaultPaymentTerms)
			if t != "" {
				if utf8.RuneCountInString(t) > maxInvoicePaymentTermsRunes {
					http.Error(w, "SaaS operator default payment terms exceed allowed length", http.StatusInternalServerError)
					return
				}
				inv.PaymentTermsMarkdown = &t
			}
		}
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		return h.invoiceRepo.CreateWithLinesInTx(tx, &inv, lines)
	}); err != nil {
		logger.ErrorfCtx(r.Context(), "CreateInvoice tx: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	logger.PrintfCtx(r.Context(), "platform_admin invoice draft user=%s invoice=%s company=%s", userID, inv.ID, body.CompanyID)
	out, err := h.invoiceRepo.FindByIDWithLines(inv.ID)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "CreateInvoice FindByIDWithLines: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, out)
}

// PatchInvoiceDraft godoc
// @ID           PlatformPatchInvoiceDraft
// @Summary      Update draft invoice (platform)
// @Description  Replaces header and lines for a draft invoice. companyId in body is ignored; taken from the existing invoice.
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                  true  "Invoice ID"
// @Param        body  body      InvoiceDraftUpsertBody  true  "Draft invoice payload"
// @Success      200   {object}  models.Invoice
// @Failure      400   {string}  string "Bad request"
// @Failure      401   {string}  string "Unauthorized"
// @Failure      403   {string}  string "Forbidden"
// @Failure      404   {string}  string "Not found"
// @Failure      409   {string}  string "Not a draft"
// @Failure      500   {string}  string "Internal server error"
// @Router       /platform/invoices/{id}/draft [patch]
func (h *PlatformHandler) PatchInvoiceDraft(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	var body InvoiceDraftUpsertBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		return h.upsertDraftInvoiceInTx(tx, id, body)
	})
	if err != nil {
		if errors.Is(err, errPlatformInvoiceNotDraft) {
			http.Error(w, "only draft invoices can be edited", http.StatusConflict)
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "PatchInvoiceDraft: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	out, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// IssueInvoice godoc
// @ID           PlatformIssueInvoice
// @Summary      Issue invoice (platform)
// @Description  Assigns document number, sets status to open, and stores buyer snapshot from the company.
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Invoice ID"
// @Success      200  {object}  models.Invoice
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      409  {string}  string "Not a draft or cannot issue"
// @Failure      500  {string}  string "Internal server error"
// @Router       /platform/invoices/{id}/issue [post]
func (h *PlatformHandler) IssueInvoice(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	now := time.Now().UTC()
	year := repository.InvoiceYearUTC(now)
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var inv models.Invoice
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Lines", func(db *gorm.DB) *gorm.DB {
				return db.Order("position ASC")
			}).
			First(&inv, "id = ?", id).Error; err != nil {
			return err
		}
		if inv.Status != "draft" {
			return errPlatformInvoiceNotDraft
		}
		if len(inv.Lines) == 0 {
			return errInvoiceNoLinesForIssue
		}
		if inv.CompanyID == nil {
			return errInvoiceNoCompanyForIssue
		}
		var company models.Company
		if err := tx.First(&company, "id = ?", *inv.CompanyID).Error; err != nil {
			return err
		}
		doc, err := h.invoiceRepo.AllocateDocumentNumber(tx, year)
		if err != nil {
			return err
		}
		snapObj := map[string]interface{}{
			"companyId":   company.ID,
			"companyName": company.Name,
		}
		if len(company.Counterparty) > 0 {
			var cp interface{}
			_ = json.Unmarshal(company.Counterparty, &cp)
			snapObj["counterparty"] = cp
		}
		snap, _ := json.Marshal(snapObj)
		updates := map[string]interface{}{
			"document_number":           doc,
			"status":                    "open",
			"issued_at":                 now,
			"allow_stripe_payment_link": false,
			"buyer_snapshot":            snap,
		}
		res := tx.Model(&models.Invoice{}).Where("id = ? AND status = ?", id, "draft").Updates(updates)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errIssueInvoiceConflict
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errPlatformInvoiceNotDraft) {
			http.Error(w, "only draft invoices can be issued", http.StatusConflict)
			return
		}
		if errors.Is(err, errIssueInvoiceConflict) {
			http.Error(w, "invoice was modified concurrently; reload and try again", http.StatusConflict)
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errInvoiceNoLinesForIssue) || errors.Is(err, errInvoiceNoCompanyForIssue) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		logger.ErrorfCtx(r.Context(), "IssueInvoice tx: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// GetPlatformInvoice godoc
// @ID           PlatformGetInvoice
// @Summary      Get invoice by ID (platform)
// @Description  Returns the invoice with lines and related preloads.
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Invoice ID"
// @Success      200  {object}  models.Invoice
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal server error"
// @Router       /platform/invoices/{id} [get]
func (h *PlatformHandler) GetPlatformInvoice(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "GetPlatformInvoice: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, inv)
}
