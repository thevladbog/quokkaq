package handlers

import (
	"encoding/json"
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
	Features featuresFlags   `json:"features"`
}

type featuresFlags struct {
	DaData        bool `json:"dadata"`
	DaDataCleaner bool `json:"dadataCleaner"`
}

func dadataConfigured() bool {
	return strings.TrimSpace(os.Getenv("DADATA_API_KEY")) != ""
}

func dadataCleanerConfigured() bool {
	return strings.TrimSpace(os.Getenv("DADATA_CLEANER_API_KEY")) != "" || dadataConfigured()
}

// GetMyCompany godoc
// @Summary      Get current user's company (tenant admin)
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  companyMeResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "No company found"
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
		Features: featuresFlags{
			DaData:        dadataConfigured(),
			DaDataCleaner: dadataCleanerConfigured(),
		},
	})
}

type patchMyCompanyBody struct {
	Name               *string          `json:"name"`
	BillingEmail       *string          `json:"billingEmail"`
	Counterparty       *json.RawMessage `json:"counterparty"`
	ClearCounterparty  *bool            `json:"clearCounterparty"`
	BillingAddress     *json.RawMessage `json:"billingAddress"`
	ClearBillingAddress *bool           `json:"clearBillingAddress"`
}

// PatchMyCompany godoc
// @Summary      Update current user's company (tenant admin)
// @Tags         companies
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.Company
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "No company found"
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

	var body patchMyCompanyBody
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
