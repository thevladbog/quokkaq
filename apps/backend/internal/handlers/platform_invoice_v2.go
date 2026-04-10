package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"quokkaq-go-backend/internal/invoicing"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type invoiceDraftLineInput struct {
	CatalogItemID           *string    `json:"catalogItemId"`
	DescriptionPrint        string     `json:"descriptionPrint"`
	Quantity                float64    `json:"quantity"`
	Unit                    string     `json:"unit"` // UOM; if empty and catalog linked, defaults from catalog
	UnitPriceInclVatMinor   int64      `json:"unitPriceInclVatMinor"`
	DiscountPercent         *float64   `json:"discountPercent"`
	DiscountAmountMinor     *int64     `json:"discountAmountMinor"`
	VatExempt               *bool      `json:"vatExempt"`
	VatRatePercent          *float64   `json:"vatRatePercent"`
	SubscriptionPlanID      *string    `json:"subscriptionPlanId"`
	SubscriptionPeriodStart *time.Time `json:"subscriptionPeriodStart"`
}

type invoiceDraftUpsertBody struct {
	CompanyID                       string                  `json:"companyId"`
	DueDate                         string                  `json:"dueDate"` // RFC3339
	Currency                        string                  `json:"currency"`
	AllowYookassaPaymentLink        bool                    `json:"allowYookassaPaymentLink"`
	AllowStripePaymentLink          bool                    `json:"allowStripePaymentLink"`
	ProvisionSubscriptionsOnPayment bool                    `json:"provisionSubscriptionsOnPayment"`
	Lines                           []invoiceDraftLineInput `json:"lines"`
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

func (h *PlatformHandler) buildDraftLines(inputs []invoiceDraftLineInput) ([]models.InvoiceLine, int64, int64, int64, error) {
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
		priceMinor := in.UnitPriceInclVatMinor
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
				if priceMinor == 0 {
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

func (h *PlatformHandler) upsertDraftInvoice(inv *models.Invoice, body invoiceDraftUpsertBody) error {
	lines, net, vat, gross, err := h.buildDraftLines(body.Lines)
	if err != nil {
		return err
	}
	inv.SubtotalExclVatMinor = net
	inv.VatTotalMinor = vat
	inv.Amount = gross
	inv.AllowYookassaPaymentLink = body.AllowYookassaPaymentLink
	inv.AllowStripePaymentLink = false
	inv.ProvisionSubscriptionsOnPayment = body.ProvisionSubscriptionsOnPayment
	due, err := time.Parse(time.RFC3339, strings.TrimSpace(body.DueDate))
	if err != nil {
		return errors.New("dueDate must be RFC3339")
	}
	inv.DueDate = due.UTC()
	if strings.TrimSpace(body.Currency) != "" {
		inv.Currency = strings.TrimSpace(body.Currency)
	}
	return database.DB.Transaction(func(tx *gorm.DB) error {
		return h.invoiceRepo.UpdateHeaderAndLinesInTx(tx, inv, lines)
	})
}

// CreateInvoice creates a draft multi-line invoice (platform).
func (h *PlatformHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var body invoiceDraftUpsertBody
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
		log.Printf("CreateInvoice Find company: %v", err)
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
		AllowStripePaymentLink:          false,
		ProvisionSubscriptionsOnPayment: body.ProvisionSubscriptionsOnPayment,
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		return h.invoiceRepo.CreateWithLinesInTx(tx, &inv, lines)
	}); err != nil {
		log.Printf("CreateInvoice tx: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("platform_admin invoice draft user=%s invoice=%s company=%s", userID, inv.ID, body.CompanyID)
	out, err := h.invoiceRepo.FindByIDWithLines(inv.ID)
	if err != nil {
		log.Printf("CreateInvoice FindByIDWithLines: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, out)
}

// PatchInvoiceDraft updates a draft invoice (lines and header fields).
func (h *PlatformHandler) PatchInvoiceDraft(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("PatchInvoiceDraft FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if inv.Status != "draft" {
		http.Error(w, "only draft invoices can be edited", http.StatusConflict)
		return
	}
	var body invoiceDraftUpsertBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if inv.CompanyID == nil {
		http.Error(w, "invoice has no company", http.StatusBadRequest)
		return
	}
	body.CompanyID = *inv.CompanyID
	if body.Currency == "" {
		body.Currency = inv.Currency
	}
	if err := h.upsertDraftInvoice(inv, body); err != nil {
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

// IssueInvoice assigns document number and sets status open.
func (h *PlatformHandler) IssueInvoice(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("IssueInvoice FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if inv.Status != "draft" {
		http.Error(w, "only draft invoices can be issued", http.StatusConflict)
		return
	}
	if len(inv.Lines) == 0 {
		http.Error(w, "invoice has no lines", http.StatusBadRequest)
		return
	}
	if inv.CompanyID == nil {
		http.Error(w, "invoice has no company", http.StatusBadRequest)
		return
	}
	company, err := h.companyRepo.FindByID(*inv.CompanyID)
	if err != nil {
		log.Printf("IssueInvoice company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()
	year := repository.InvoiceYearUTC(now)
	var doc string
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		doc, err = h.invoiceRepo.AllocateDocumentNumber(tx, year)
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
			"document_number":             doc,
			"status":                      "open",
			"issued_at":                   now,
			"allow_stripe_payment_link":   false,
			"buyer_snapshot":              snap,
		}
		return tx.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(updates).Error
	}); err != nil {
		log.Printf("IssueInvoice tx: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	_ = doc
	out, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, out)
}

// GetPlatformInvoice returns invoice with lines for platform admin.
func (h *PlatformHandler) GetPlatformInvoice(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("GetPlatformInvoice: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, inv)
}
