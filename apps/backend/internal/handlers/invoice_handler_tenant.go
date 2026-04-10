package handlers

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services/billing"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// Hardcoded return URL used only when APP_ENV is local-dev-like and neither
// YOOKASSA_PAYMENT_RETURN_URL nor PUBLIC_APP_URL is set (see RequestYooKassaPaymentLink).
const yooKassaDevPaymentReturnURL = "https://localhost/payment-return"

// GetMyInvoiceByID godoc
// @Summary      Get invoice by ID (tenant)
// @Description  Returns one non-draft invoice with lines for the authenticated user's company. Draft invoices and invoices belonging to other companies are not exposed (404/403).
// @Tags         invoices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Invoice ID"
// @Success      200  {object}  models.Invoice
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal server error"
// @Router       /invoices/{id} [get]
func (h *InvoiceHandler) GetMyInvoiceByID(w http.ResponseWriter, r *http.Request) {
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
		log.Printf("GetMyInvoiceByID GetCompanyID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("GetMyInvoiceByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if inv.CompanyID == nil || *inv.CompanyID != companyID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if inv.Status == "draft" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, inv)
}

// GetSaaSVendor godoc
// @Summary      Get SaaS vendor company for invoices
// @Description  Returns the SaaS operator company (legal and payment accounts) for invoice display. Responds with 404 when no operator company is marked.
// @Tags         invoices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.Company
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No SaaS operator company configured"
// @Failure      500  {string}  string "Internal server error"
// @Router       /invoices/me/vendor [get]
func (h *InvoiceHandler) GetSaaSVendor(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	c, err := h.companyRepo.FindSaaSOperatorCompany()
	if err != nil {
		log.Printf("GetSaaSVendor: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if c == nil {
		http.Error(w, "No SaaS operator company is configured", http.StatusNotFound)
		return
	}
	RespondJSON(w, c)
}

// RequestYooKassaPaymentLink godoc
// @Summary      Request YooKassa payment link for an invoice
// @Description  Creates or returns an existing YooKassa confirmation URL for an open invoice when online payment is enabled. Returns confirmationUrl and paymentId.
// @Tags         invoices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Invoice ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal server error"
// @Failure      502  {string}  string "Bad Gateway"
// @Failure      503  {string}  string "Service Unavailable"
// @Router       /invoices/{id}/yookassa-payment-link [post]
func (h *InvoiceHandler) RequestYooKassaPaymentLink(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	inv, err := h.invoiceRepo.FindByIDWithLines(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if inv.CompanyID == nil || *inv.CompanyID != companyID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if !inv.AllowYookassaPaymentLink {
		http.Error(w, "Online payment is not enabled for this invoice", http.StatusForbidden)
		return
	}
	if inv.Status != "open" {
		http.Error(w, "Invoice is not payable in this state", http.StatusBadRequest)
		return
	}
	if h.yooKassa == nil || !h.yooKassa.Configured() {
		http.Error(w, "Payment service is not configured", http.StatusServiceUnavailable)
		return
	}
	if strings.TrimSpace(inv.YookassaConfirmationURL) != "" {
		RespondJSON(w, map[string]string{
			"confirmationUrl": inv.YookassaConfirmationURL,
			"paymentId":       inv.YookassaPaymentID,
		})
		return
	}
	ret := strings.TrimSpace(h.yooReturnURL)
	if ret == "" {
		ret = strings.TrimSpace(h.publicAppURL)
	}
	if ret == "" {
		if config.AppEnvAllowsYooKassaDevReturnURLFallback() {
			ret = yooKassaDevPaymentReturnURL
			log.Printf("RequestYooKassaPaymentLink: using development-only default return URL %q (set YOOKASSA_PAYMENT_RETURN_URL or PUBLIC_APP_URL)", ret)
		} else {
			log.Printf("RequestYooKassaPaymentLink: payment return URL missing (APP_ENV=%q); set YOOKASSA_PAYMENT_RETURN_URL or PUBLIC_APP_URL", strings.TrimSpace(os.Getenv("APP_ENV")))
			http.Error(w, "Payment return URL is not configured", http.StatusServiceUnavailable)
			return
		}
	}
	payID, url, err := h.yooKassa.CreatePayment(r.Context(), inv, ret)
	if err != nil {
		log.Printf("RequestYooKassaPaymentLink CreatePayment: %v", err)
		if errors.Is(err, billing.ErrYooKassaReturnURLRequired) {
			http.Error(w, "Payment return URL is not configured", http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "Could not create payment", http.StatusBadGateway)
		return
	}
	if err := h.invoiceRepo.UpdateYookassaPayment(inv.ID, payID, url); err != nil {
		log.Printf("RequestYooKassaPaymentLink Updates: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, map[string]string{
		"confirmationUrl": url,
		"paymentId":       payID,
	})
}
