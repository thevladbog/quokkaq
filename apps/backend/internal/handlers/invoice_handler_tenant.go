package handlers

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// GetMyInvoiceByID returns one invoice with lines for the user's company.
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

// GetSaaSVendor returns the SaaS operator company (legal + payment accounts) for invoice display.
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
		// 200 + null: optional resource; avoids client 404 noise (browser + apiRequest error logs).
		RespondJSON(w, nil)
		return
	}
	RespondJSON(w, c)
}

// RequestYooKassaPaymentLink creates or returns an existing YooKassa confirmation URL (tenant).
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
		ret = "https://localhost/payment-return"
	}
	payID, url, err := h.yooKassa.CreatePayment(r.Context(), inv, ret)
	if err != nil {
		log.Printf("RequestYooKassaPaymentLink CreatePayment: %v", err)
		http.Error(w, "Could not create payment", http.StatusBadGateway)
		return
	}
	if err := database.DB.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(map[string]interface{}{
		"yookassa_payment_id":         payID,
		"yookassa_confirmation_url":   url,
		"payment_provider":           "yookassa",
		"payment_provider_invoice_id": payID,
	}).Error; err != nil {
		log.Printf("RequestYooKassaPaymentLink Updates: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, map[string]string{
		"confirmationUrl": url,
		"paymentId":       payID,
	})
}
