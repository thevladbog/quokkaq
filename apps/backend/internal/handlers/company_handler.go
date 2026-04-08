package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"
)

type CompanyHandler struct {
	companyRepo repository.CompanyRepository
	userRepo    repository.UserRepository
}

func NewCompanyHandler(companyRepo repository.CompanyRepository, userRepo repository.UserRepository) *CompanyHandler {
	return &CompanyHandler{
		companyRepo: companyRepo,
		userRepo:    userRepo,
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
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/complete-onboarding [post]
func (h *CompanyHandler) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get user's company through their units
	db := database.DB
	type Result struct {
		CompanyID string
	}

	var result Result
	err := db.Table("user_units").
		Select("units.company_id").
		Joins("LEFT JOIN units ON user_units.unit_id = units.id").
		Where("user_units.user_id = ?", userID).
		First(&result).Error

	if err != nil {
		http.Error(w, "User has no associated company", http.StatusNotFound)
		return
	}

	company, err := h.companyRepo.FindByID(result.CompanyID)
	if err != nil {
		http.Error(w, "Company not found", http.StatusNotFound)
		return
	}

	// Update onboarding state
	onboardingState := map[string]interface{}{
		"completed": true,
	}
	
	onboardingJSON, err := json.Marshal(onboardingState)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	company.OnboardingState = onboardingJSON
	if err := h.companyRepo.Update(company); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, map[string]bool{"success": true})
}
