package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/services"
)

// MaxPublicLeadRequestBodyBytes caps JSON for POST /public/leads/request.
const MaxPublicLeadRequestBodyBytes = 1 << 16 // 64 KiB

// LeadHandler exposes public lead capture (marketing form).
type LeadHandler struct {
	leadIssues *services.LeadIssueService
}

// NewLeadHandler constructs LeadHandler.
func NewLeadHandler(leadIssues *services.LeadIssueService) *LeadHandler {
	return &LeadHandler{leadIssues: leadIssues}
}

// PublicLeadRequestBody is JSON for POST /public/leads/request.
type PublicLeadRequestBody struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Company  string `json:"company"`
	Message  string `json:"message"`
	Source   string `json:"source"`
	Locale   string `json:"locale"`
	Referrer string `json:"referrer"`
	PlanCode string `json:"planCode"`
}

// PostPublicLeadRequest godoc
// @ID           postPublicLeadRequest
// @Summary      Submit a marketing / sales lead (Yandex Tracker)
// @Description  Public endpoint; creates a Tracker issue when leads queue and Tracker credentials are configured.
// @Tags         leads
// @Accept       json
// @Produce      json
// @Param        body  body      PublicLeadRequestBody  true  "Lead payload"
// @Success      201   {object}  map[string]string  "Created"
// @Failure      400   {string}  string  "Bad request"
// @Failure      503   {string}  string  "Leads or Tracker not configured"
// @Failure      502   {string}  string  "Upstream Tracker error"
// @Router       /public/leads/request [post]
func (h *LeadHandler) PostPublicLeadRequest(w http.ResponseWriter, r *http.Request) {
	if h.leadIssues == nil {
		http.Error(w, "Lead capture is not configured", http.StatusServiceUnavailable)
		return
	}
	limited := http.MaxBytesReader(w, r.Body, MaxPublicLeadRequestBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		http.Error(w, "Request entity too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req PublicLeadRequestBody
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	if name == "" || email == "" {
		http.Error(w, "name and email are required", http.StatusBadRequest)
		return
	}
	ok, err := h.leadIssues.LeadsConfigured(r.Context())
	if err != nil {
		http.Error(w, "Failed to verify configuration", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "Lead capture is not configured", http.StatusServiceUnavailable)
		return
	}
	err = h.leadIssues.CreateLeadRequest(r.Context(), name, email, strings.TrimSpace(req.Company), strings.TrimSpace(req.Message),
		strings.TrimSpace(req.Source), strings.TrimSpace(req.Locale), strings.TrimSpace(req.Referrer), strings.TrimSpace(req.PlanCode))
	if err != nil {
		logger.PrintfCtx(r.Context(), "PostPublicLeadRequest: CreateLeadRequest: %v", err)
		if strings.Contains(strings.ToLower(err.Error()), "not configured") {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		if config.ExposePublicLeadUpstreamError() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":  "Failed to create ticket",
				"detail": err.Error(),
			})
			return
		}
		http.Error(w, "Failed to create ticket", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
}
