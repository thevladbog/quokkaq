package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// companyMeResponse is returned by GET /companies/me.
type companyMeResponse struct {
	Company  *models.Company `json:"company"`
	Features FeaturesFlags   `json:"features"`
}

// FeaturesFlags describes DaData-related UI toggles for the deployment.
type FeaturesFlags struct {
	DaData        bool `json:"dadata" example:"true"`
	DaDataCleaner bool `json:"dadataCleaner" example:"false"`
}

func dadataConfigured() bool {
	return strings.TrimSpace(os.Getenv("DADATA_API_KEY")) != ""
}

func dadataCleanerConfigured() bool {
	return strings.TrimSpace(os.Getenv("DADATA_CLEANER_API_KEY")) != ""
}

// GetMyCompany godoc
// @Summary      Get current user's company (tenant admin)
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  companyMeResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me [get]
func (h *CompanyHandler) GetMyCompany(w http.ResponseWriter, r *http.Request) {
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
		log.Printf("GetMyCompany GetCompanyIDByUserID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		log.Printf("GetMyCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, companyMeResponse{
		Company: company,
		Features: FeaturesFlags{
			DaData:        dadataConfigured(),
			DaDataCleaner: dadataCleanerConfigured(),
		},
	})
}

// PatchMyCompany godoc
// @Summary      Update current user's company (tenant admin)
// @Description  Partial update: JSON body matches models.CompanyPatch at the root (not wrapped in a "company" property). Only send fields to change. Cannot combine clearBillingAddress with billingAddress (same for counterparty).
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        company  body      models.CompanyPatch  true  "Patch payload"
// @Security     BearerAuth
// @Success      200  {object}  models.Company
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me [patch]
func (h *CompanyHandler) PatchMyCompany(w http.ResponseWriter, r *http.Request) {
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
		log.Printf("PatchMyCompany GetCompanyIDByUserID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		log.Printf("PatchMyCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var body models.CompanyPatch
	if err := dec.Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	var tail any
	if err := dec.Decode(&tail); err != io.EOF {
		if err == nil {
			http.Error(w, "request body must contain a single JSON object", http.StatusBadRequest)
			return
		}
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if body.ClearBillingAddress != nil && *body.ClearBillingAddress && body.BillingAddress != nil {
		http.Error(w, "cannot set billingAddress and clearBillingAddress together", http.StatusBadRequest)
		return
	}
	if body.ClearCounterparty != nil && *body.ClearCounterparty && body.Counterparty != nil {
		http.Error(w, "cannot set counterparty and clearCounterparty together", http.StatusBadRequest)
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

	if err := h.companyRepo.Update(company); err != nil {
		log.Printf("PatchMyCompany Update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	updated, err := h.companyRepo.FindByID(company.ID)
	if err != nil {
		log.Printf("PatchMyCompany FindByID after update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}
