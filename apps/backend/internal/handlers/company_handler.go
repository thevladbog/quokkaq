package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
)

type CompanyHandler struct {
	companyRepo repository.CompanyRepository
	userRepo    repository.UserRepository
	tenantRBAC  repository.TenantRBACRepository
}

func NewCompanyHandler(companyRepo repository.CompanyRepository, userRepo repository.UserRepository, tenantRBAC repository.TenantRBACRepository) *CompanyHandler {
	return &CompanyHandler{
		companyRepo: companyRepo,
		userRepo:    userRepo,
		tenantRBAC:  tenantRBAC,
	}
}

// CompleteOnboarding godoc
// @Summary      Complete Onboarding
// @Description  Marks onboarding as complete for the user's company
// @Tags         companies
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]bool
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden: no access to selected organization"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/complete-onboarding [post]
func (h *CompanyHandler) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return
		}
		log.Printf("company CompleteOnboarding: ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		log.Printf("company CompleteOnboarding: FindByID: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Update onboarding state
	onboardingState := map[string]interface{}{
		"completed": true,
	}

	onboardingJSON, err := json.Marshal(onboardingState)
	if err != nil {
		log.Printf("company CompleteOnboarding: json.Marshal onboarding state: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	company.OnboardingState = onboardingJSON

	if err := h.companyRepo.Update(company); err != nil {
		log.Printf("company CompleteOnboarding: Update: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, map[string]bool{"success": true})
}
