package handlers

import (
	"errors"
	"log"
	"net/http"
	"net/url"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/services/billing"

	"github.com/go-chi/chi/v5"
)

type InvoiceHandler struct {
	invoiceRepo  repository.InvoiceRepository
	companyRepo  repository.CompanyRepository
	userRepo     repository.UserRepository
	yooKassa     *billing.YooKassaInvoiceClient
	yooReturnURL string
	publicAppURL string
}

func NewInvoiceHandler(
	invoiceRepo repository.InvoiceRepository,
	companyRepo repository.CompanyRepository,
	userRepo repository.UserRepository,
	yooKassa *billing.YooKassaInvoiceClient,
	yooReturnURL string,
	publicAppURL string,
) *InvoiceHandler {
	return &InvoiceHandler{
		invoiceRepo:  invoiceRepo,
		companyRepo:  companyRepo,
		userRepo:     userRepo,
		yooKassa:     yooKassa,
		yooReturnURL: yooReturnURL,
		publicAppURL: publicAppURL,
	}
}

// GetMyInvoices godoc
// @Summary      Get Current User's Invoices
// @Description  Returns invoices for the authenticated user's company
// @Tags         invoices
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.Invoice
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invoices/me [get]
func (h *InvoiceHandler) GetMyInvoices(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	companyID, err := h.userRepo.GetCompanyIDByUserID(userID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		log.Printf("GetMyInvoices userRepo.GetCompanyIDByUserID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	invoices, err := h.invoiceRepo.FindByCompanyIDNonDraft(companyID)
	if err != nil {
		log.Printf("GetMyInvoices invoiceRepo.FindByCompanyID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, invoices)
}

// DownloadInvoice godoc
// @Summary      Download invoice PDF
// @Description  Returns application/pdf (A4 счёт на оплату with ST00012 QR). 422 if SaaS operator bank details cannot form a valid QR.
// @Tags         invoices
// @Produce      json
// @Produce      application/pdf
// @Security     BearerAuth
// @Param        id path string true "Invoice ID"
// @Success      200  {file}  file  "Invoice PDF"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      422  {object}  map[string]string "code=invoice_pdf_prerequisites, localized message"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invoices/{id}/download [get]
func (h *InvoiceHandler) DownloadInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	invoiceID := chi.URLParam(r, "id")

	platformAdmin, err := h.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		log.Printf("DownloadInvoice IsPlatformAdmin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	invoice, err := h.invoiceRepo.FindByIDWithLines(invoiceID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Invoice not found", http.StatusNotFound)
			return
		}
		log.Printf("DownloadInvoice invoiceRepo.FindByIDWithLines(%s): %v", invoiceID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if invoice == nil {
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}

	if invoice.Status == "draft" && !platformAdmin {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	var hasAccess bool
	if invoice.CompanyID != nil && *invoice.CompanyID != "" {
		hasAccess, err = h.userRepo.HasCompanyAccess(userID, *invoice.CompanyID)
		if err != nil {
			log.Printf("DownloadInvoice userRepo.HasCompanyAccess: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	} else {
		hasAccess, err = h.userRepo.IsAdmin(userID)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}
	hasAccess = hasAccess || platformAdmin
	if !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	vendor, err := h.companyRepo.FindSaaSOperatorCompany()
	if err != nil {
		log.Printf("DownloadInvoice FindSaaSOperatorCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if vendor == nil {
		loc := middleware.GetLocale(r.Context())
		RespondJSONWithStatus(w, http.StatusUnprocessableEntity, map[string]string{
			"code":    "invoice_pdf_prerequisites",
			"message": services.InvoicePDFPrerequisitesUserMessage(loc),
		})
		return
	}

	pdfBytes, err := services.BuildInvoicePDF(invoice, vendor)
	if errors.Is(err, services.ErrInvoicePDFQRPrerequisites) {
		loc := middleware.GetLocale(r.Context())
		RespondJSONWithStatus(w, http.StatusUnprocessableEntity, map[string]string{
			"code":    "invoice_pdf_prerequisites",
			"message": services.InvoicePDFPrerequisitesUserMessage(loc),
		})
		return
	}
	if err != nil {
		log.Printf("DownloadInvoice BuildInvoicePDF: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	suffix, err := services.InvoicePDFDownloadSuffix()
	if err != nil {
		log.Printf("DownloadInvoice InvoicePDFDownloadSuffix: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	asciiName := services.InvoicePDFASCIIFilename(invoice, suffix)
	utf8Name := services.InvoicePDFUTF8Filename(invoice, suffix)
	cd := `attachment; filename="` + asciiName + `"; filename*=UTF-8''` + url.PathEscape(utf8Name)
	w.Header().Set("Content-Disposition", cd)
	w.Header().Set("Content-Type", "application/pdf")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(pdfBytes); err != nil {
		log.Printf("DownloadInvoice write body: %v", err)
	}
}
