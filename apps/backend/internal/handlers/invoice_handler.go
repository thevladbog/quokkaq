package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"
	"time"

	"github.com/go-chi/chi/v5"
)

type InvoiceHandler struct {
	invoiceRepo repository.InvoiceRepository
	userRepo    repository.UserRepository
}

func NewInvoiceHandler(invoiceRepo repository.InvoiceRepository, userRepo repository.UserRepository) *InvoiceHandler {
	return &InvoiceHandler{
		invoiceRepo: invoiceRepo,
		userRepo:    userRepo,
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

	invoices, err := h.invoiceRepo.FindByCompanyID(result.CompanyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, invoices)
}

// DownloadInvoice godoc
// @Summary      Download Invoice
// @Description  Downloads invoice as PDF
// @Tags         invoices
// @Produce      application/pdf
// @Security     BearerAuth
// @Param        id path string true "Invoice ID"
// @Success      200  {file}    binary
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      501  {string}  string "Not Implemented"
// @Router       /invoices/{id}/download [get]
func (h *InvoiceHandler) DownloadInvoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	invoiceID := chi.URLParam(r, "id")

	invoice, err := h.invoiceRepo.FindByID(invoiceID)
	if err != nil {
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}

	// Verify user has access to this invoice's company
	hasAccess, err := h.userRepo.HasCompanyAccess(userID, invoice.CompanyID)
	if err != nil || !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// TODO: Generate actual PDF invoice using a PDF library
	// For now, return a simple JSON representation
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=invoice-%s.json", invoice.ID))

	type InvoiceDownload struct {
		InvoiceNumber string    `json:"invoiceNumber"`
		Date          time.Time `json:"date"`
		DueDate       time.Time `json:"dueDate"`
		Amount        int64     `json:"amount"`
		Currency      string    `json:"currency"`
		Status        string    `json:"status"`
		PaidAt        *time.Time `json:"paidAt,omitempty"`
	}

	download := InvoiceDownload{
		InvoiceNumber: invoice.ID,
		Date:          invoice.CreatedAt,
		DueDate:       invoice.DueDate,
		Amount:        invoice.Amount,
		Currency:      invoice.Currency,
		Status:        invoice.Status,
		PaidAt:        invoice.PaidAt,
	}

	if err := json.NewEncoder(w).Encode(download); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
