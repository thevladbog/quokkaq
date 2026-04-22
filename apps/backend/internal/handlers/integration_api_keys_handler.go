package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var allowedIntegrationScopes = map[string]struct{}{
	"tickets:read":  {},
	"tickets:write": {},
}

// IntegrationAPIKeysHandler manages integration API keys for the active tenant.
type IntegrationAPIKeysHandler struct {
	db       *gorm.DB
	keys     repository.IntegrationAPIKeyRepository
	userRepo repository.UserRepository
	unitRepo repository.UnitRepository
}

func NewIntegrationAPIKeysHandler(db *gorm.DB, keys repository.IntegrationAPIKeyRepository, userRepo repository.UserRepository, unitRepo repository.UnitRepository) *IntegrationAPIKeysHandler {
	return &IntegrationAPIKeysHandler{db: db, keys: keys, userRepo: userRepo, unitRepo: unitRepo}
}

func (h *IntegrationAPIKeysHandler) resolveCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return "", false
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}

type integrationAPIKeyRowDTO struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	CompanyID       string   `json:"companyId"`
	UnitID          *string  `json:"unitId,omitempty"`
	Scopes          []string `json:"scopes"`
	CreatedByUserID *string  `json:"createdByUserId,omitempty"`
	RevokedAt       *string  `json:"revokedAt,omitempty"`
	LastUsedAt      *string  `json:"lastUsedAt,omitempty"`
	CreatedAt       string   `json:"createdAt"`
}

type createIntegrationAPIKeyRequest struct {
	Name   string   `json:"name"`
	UnitID *string  `json:"unitId,omitempty"`
	Scopes []string `json:"scopes"`
}

type createIntegrationAPIKeyResponse struct {
	Key   integrationAPIKeyRowDTO `json:"key"`
	Token string                  `json:"token"`
}

// ListIntegrationAPIKeys godoc
// @Summary      List integration API keys
// @Tags         integrations
// @Security     BearerAuth
// @Produce      json
// @Success      200 {array} handlers.integrationAPIKeyRowDTO
// @Router       /companies/me/integration-api-keys [get]
func (h *IntegrationAPIKeysHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rows, err := h.keys.ListByCompany(r.Context(), companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]integrationAPIKeyRowDTO, 0, len(rows))
	for i := range rows {
		out = append(out, integrationKeyToDTO(&rows[i]))
	}
	RespondJSON(w, out)
}

// CreateIntegrationAPIKey godoc
// @Summary      Create integration API key
// @Tags         integrations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body createIntegrationAPIKeyRequest true "request"
// @Success      201 {object} createIntegrationAPIKeyResponse
// @Router       /companies/me/integration-api-keys [post]
func (h *IntegrationAPIKeysHandler) Create(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okPlan, err := subscriptionfeatures.CompanyHasAPIAccess(r.Context(), h.db, companyID)
	if err != nil || !okPlan {
		http.Error(w, "API access is not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	userID, _ := middleware.GetUserIDFromContext(r.Context())
	var req createIntegrationAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	scopes := normalizeScopes(req.Scopes)
	if len(scopes) == 0 {
		scopes = []string{"tickets:read"}
	}
	var unitID *string
	if req.UnitID != nil && strings.TrimSpace(*req.UnitID) != "" {
		u := strings.TrimSpace(*req.UnitID)
		unit, uerr := h.unitRepo.FindByIDLight(u)
		if uerr != nil || unit == nil || unit.CompanyID != companyID {
			http.Error(w, "invalid unitId", http.StatusBadRequest)
			return
		}
		unitID = &u
	}
	secretRand := make([]byte, 32)
	if _, err := rand.Read(secretRand); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	secret := hex.EncodeToString(secretRand)
	row := models.IntegrationAPIKey{
		CompanyID:       companyID,
		UnitID:          unitID,
		Name:            name,
		Scopes:          mustJSONScopes(scopes),
		CreatedByUserID: &userID,
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	row.SecretHash = string(hash)
	if err := h.keys.Create(r.Context(), &row); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	token := "qqk_" + row.ID + "_" + secret
	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, createIntegrationAPIKeyResponse{
		Key:   integrationKeyToDTO(&row),
		Token: token,
	})
}

// RevokeIntegrationAPIKey godoc
// @Summary      Revoke integration API key
// @Tags         integrations
// @Security     BearerAuth
// @Param        id path string true "Key ID"
// @Success      204
// @Router       /companies/me/integration-api-keys/{id} [delete]
func (h *IntegrationAPIKeysHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := h.keys.Revoke(r.Context(), id, companyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func integrationKeyToDTO(k *models.IntegrationAPIKey) integrationAPIKeyRowDTO {
	var scopes []string
	_ = json.Unmarshal(k.Scopes, &scopes)
	dto := integrationAPIKeyRowDTO{
		ID:              k.ID,
		Name:            k.Name,
		CompanyID:       k.CompanyID,
		UnitID:          k.UnitID,
		Scopes:          scopes,
		CreatedByUserID: k.CreatedByUserID,
		CreatedAt:       k.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
	if k.RevokedAt != nil {
		s := k.RevokedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
		dto.RevokedAt = &s
	}
	if k.LastUsedAt != nil {
		s := k.LastUsedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
		dto.LastUsedAt = &s
	}
	return dto
}

func normalizeScopes(in []string) []string {
	var out []string
	seen := map[string]struct{}{}
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := allowedIntegrationScopes[s]; !ok {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func mustJSONScopes(scopes []string) json.RawMessage {
	b, _ := json.Marshal(scopes)
	return b
}
