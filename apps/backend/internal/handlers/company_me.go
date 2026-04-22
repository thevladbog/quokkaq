package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"quokkaq-go-backend/internal/logger"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/subscriptionfeatures"
)

// companyPatchSsoAccessSourceOnly is the only JSON shape non-global-admin callers may send to PATCH /companies/me.
// Extra keys are rejected (json.Decoder DisallowUnknownFields). When models.CompanyPatch gains fields, non-admins
// still cannot set them without adding them here explicitly.
type companyPatchSsoAccessSourceOnly struct {
	SsoAccessSource *string `json:"ssoAccessSource,omitempty"`
}

// planCapabilitiesDTO reflects subscription-gated integration features for the active company (tenant UI).
type planCapabilitiesDTO struct {
	APIAccess         bool `json:"apiAccess"`
	OutboundWebhooks  bool `json:"outboundWebhooks"`
	PublicQueueWidget bool `json:"publicQueueWidget"`
}

// companyMeResponse is returned by GET /companies/me.
type companyMeResponse struct {
	Company          *models.Company     `json:"company"`
	Features         FeaturesFlags       `json:"features"`
	PlanCapabilities planCapabilitiesDTO `json:"planCapabilities"`
	PublicAPIURL     string              `json:"publicApiUrl" example:"https://api.example.com"`
	PublicAppURL     string              `json:"publicAppUrl" example:"https://app.example.com"`
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

// canChangeSsoAccessSource is true if the caller may change models.CompanyPatch.ssoAccessSource on PatchMyCompany:
// global admin (`admin`), platform admin (`platform_admin`), or company-scoped tenant role `system_admin` (not unit-scoped tenant.admin).
func (h *CompanyHandler) canChangeSsoAccessSource(actorID, companyID string) (bool, error) {
	ok, err := h.userRepo.IsPlatformAdmin(actorID)
	if err != nil || ok {
		return ok, err
	}
	ok, err = h.userRepo.IsAdmin(actorID)
	if err != nil || ok {
		return ok, err
	}
	return h.tenantRBAC.UserHasTenantSystemAdminRole(actorID, companyID)
}

// GetMyCompany godoc
// @Summary      Get current user's company (tenant admin)
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200  {object}  companyMeResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden: no access to selected organization"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me [get]
func (h *CompanyHandler) GetMyCompany(w http.ResponseWriter, r *http.Request) {
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
		logger.PrintfCtx(r.Context(), "GetMyCompany ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "GetMyCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	apiAccess, _ := subscriptionfeatures.CompanyHasAPIAccess(r.Context(), h.db, companyID)
	outWebhooks, _ := subscriptionfeatures.CompanyHasOutboundWebhooks(r.Context(), h.db, companyID)
	pubWidget, _ := subscriptionfeatures.CompanyHasPublicQueueWidget(r.Context(), h.db, companyID)

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, companyMeResponse{
		Company: company,
		Features: FeaturesFlags{
			DaData:        dadataConfigured(),
			DaDataCleaner: dadataCleanerConfigured(),
		},
		PlanCapabilities: planCapabilitiesDTO{
			APIAccess:         apiAccess,
			OutboundWebhooks:  outWebhooks,
			PublicQueueWidget: pubWidget,
		},
		PublicAPIURL: services.APIPublicURL(),
		PublicAppURL: services.PublicAppURL(),
	})
}

// PatchMyCompany godoc
// @Summary      Update current user's company (tenant admin)
// @Description  Partial update: JSON body matches models.CompanyPatch at the root (not wrapped in a "company" property). Only send fields to change. Cannot combine clearBillingAddress with billingAddress (same for counterparty). If the body includes `ssoAccessSource`, the caller must satisfy logical scope `company.settings.ssoAccessSource`, which the server grants when the principal matches any of: `global.role.admin`, `global.role.platform_admin`, or `company.tenant_role.system_admin`. Unit-scoped permission `tenant.admin` alone (scope `unit.tenant.admin`) is not sufficient. Other fields still require global `admin` unless the body only contains `ssoAccessSource` and the caller is authorized as above. See the PatchMyCompany operation `x-logical-scopes` extension in OpenAPI for the documented scope labels (runtime auth remains Bearer JWT only).
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        company  body      models.CompanyPatch  true  "Patch payload"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Security     BearerAuth
// @Success      200  {object}  models.Company
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden: no access to selected organization"
// @Failure      404  {string}  string "No company found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me [patch]
func (h *CompanyHandler) PatchMyCompany(w http.ResponseWriter, r *http.Request) {
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
		logger.PrintfCtx(r.Context(), "PatchMyCompany ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return
		}
		logger.PrintfCtx(r.Context(), "PatchMyCompany FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	isGlobalAdmin, err := h.userRepo.IsAdmin(userID)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PatchMyCompany IsAdmin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	isPlatformAdmin, err := h.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PatchMyCompany IsPlatformAdmin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	isTenantSystemAdmin, err := h.tenantRBAC.UserHasTenantSystemAdminRole(userID, companyID)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PatchMyCompany UserHasTenantSystemAdminRole: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	fullPatch := isGlobalAdmin || isPlatformAdmin || isTenantSystemAdmin

	var body models.CompanyPatch
	if fullPatch {
		dec := json.NewDecoder(bytes.NewReader(bodyBytes))
		dec.DisallowUnknownFields()
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
	} else {
		dec := json.NewDecoder(bytes.NewReader(bodyBytes))
		dec.DisallowUnknownFields()
		var narrow companyPatchSsoAccessSourceOnly
		if err := dec.Decode(&narrow); err != nil {
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
		if narrow.SsoAccessSource == nil {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		body = models.CompanyPatch{SsoAccessSource: narrow.SsoAccessSource}
	}

	if body.SsoAccessSource != nil {
		ok, err := h.canChangeSsoAccessSource(userID, companyID)
		if err != nil {
			logger.PrintfCtx(r.Context(), "PatchMyCompany canChangeSsoAccessSource: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
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
	if body.SsoAccessSource != nil {
		v := strings.ToLower(strings.TrimSpace(*body.SsoAccessSource))
		if v != models.SsoAccessSourceManual && v != models.SsoAccessSourceSSOGroups {
			http.Error(w, "invalid ssoAccessSource", http.StatusBadRequest)
			return
		}
		company.SsoAccessSource = v
	}

	if err := h.companyRepo.Update(company); err != nil {
		logger.PrintfCtx(r.Context(), "PatchMyCompany Update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	updated, err := h.companyRepo.FindByID(company.ID)
	if err != nil {
		logger.PrintfCtx(r.Context(), "PatchMyCompany FindByID after update: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, updated)
}
