package handlers

import (
	"log"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// InvoicePDFNotImplementedResponse is the JSON body for DownloadInvoice until PDF export exists.
type InvoicePDFNotImplementedResponse struct {
	Error string `json:"error"`
}

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

	invoices, err := h.invoiceRepo.FindByCompanyID(companyID)
	if err != nil {
		log.Printf("GetMyInvoices invoiceRepo.FindByCompanyID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, invoices)
}

// DownloadInvoice godoc
// @Summary      Download Invoice (PDF when implemented)
// @Description  Currently returns HTTP 501 with JSON after authorization. When PDF export is implemented, a successful response will be 200 with body as application/pdf (binary PDF bytes). Until then, clients should treat 501 and handlers.InvoicePDFNotImplementedResponse as the expected outcome.
// @Tags         invoices
// @Produce      json
// @Produce      application/pdf
// @Security     BearerAuth
// @Param        id path string true "Invoice ID"
// @Success      200  {file}  file  "Invoice PDF binary (Content-Type: application/pdf) once generation is implemented"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Failure      500  {string}  string "Internal Server Error"
// @Failure      501  {object}  handlers.InvoicePDFNotImplementedResponse "PDF export not implemented"
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
		if repository.IsNotFound(err) {
			http.Error(w, "Invoice not found", http.StatusNotFound)
			return
		}
		log.Printf("DownloadInvoice invoiceRepo.FindByID(%s): %v", invoiceID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if invoice == nil {
		http.Error(w, "Invoice not found", http.StatusNotFound)
		return
	}

	// CompanyID may be nil after company deletion (SET NULL); only admins can access those retained rows.
	var hasAccess bool
	if invoice.CompanyID != nil && *invoice.CompanyID != "" {
		var err error
		hasAccess, err = h.userRepo.HasCompanyAccess(userID, *invoice.CompanyID)
		if err != nil {
			log.Printf("DownloadInvoice userRepo.HasCompanyAccess: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	} else {
		var err error
		hasAccess, err = h.userRepo.IsAdmin(userID)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}
	if !hasAccess {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	RespondJSONWithStatus(w, http.StatusNotImplemented, InvoicePDFNotImplementedResponse{
		Error: "Invoice PDF generation is not implemented yet",
	})
}
