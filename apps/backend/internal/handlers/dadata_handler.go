package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/integrations/dadata"
)

// DaDataHandler proxies DaData Suggestions/Cleaner (no keys to the browser).
type DaDataHandler struct{}

func NewDaDataHandler() *DaDataHandler {
	return &DaDataHandler{}
}

type findPartyByInnBody struct {
	Inn  string  `json:"inn"`
	KPP  *string `json:"kpp"`
	Type *string `json:"type"`
}

// FindPartyByInn godoc
// @Summary      DaData: organization by INN (findById/party)
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Router       /companies/dadata/party/find-by-inn [post]
func (h *DaDataHandler) FindPartyByInn(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	var body findPartyByInnBody
	if err := json.Unmarshal(b, &body); err != nil || strings.TrimSpace(body.Inn) == "" {
		http.Error(w, "inn is required", http.StatusBadRequest)
		return
	}
	payload := map[string]interface{}{"query": strings.TrimSpace(body.Inn)}
	if body.KPP != nil && strings.TrimSpace(*body.KPP) != "" {
		payload["kpp"] = strings.TrimSpace(*body.KPP)
	}
	if body.Type != nil && strings.TrimSpace(*body.Type) != "" {
		payload["type"] = strings.TrimSpace(*body.Type)
	}
	out, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	raw, status, err := dc.FindPartyByID(out)
	if err != nil {
		log.Printf("DaData FindPartyByID: %v", err)
		http.Error(w, "Upstream error", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCodeOr200(status))
	_, _ = w.Write(raw)
}

// SuggestParty godoc
// @Summary      DaData: party suggestions (passthrough body)
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Router       /companies/dadata/party/suggest [post]
func (h *DaDataHandler) SuggestParty(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	raw, status, err := dc.SuggestParty(b)
	if err != nil {
		log.Printf("DaData SuggestParty: %v", err)
		http.Error(w, "Upstream error", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCodeOr200(status))
	_, _ = w.Write(raw)
}

// SuggestAddress godoc
// @Summary      DaData: address suggestions (passthrough body)
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Router       /companies/dadata/address/suggest [post]
func (h *DaDataHandler) SuggestAddress(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	raw, status, err := dc.SuggestAddress(b)
	if err != nil {
		log.Printf("DaData SuggestAddress: %v", err)
		http.Error(w, "Upstream error", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCodeOr200(status))
	_, _ = w.Write(raw)
}

// CleanAddress godoc
// @Summary      DaData Cleaner: standardize address strings
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Router       /companies/dadata/address/clean [post]
func (h *DaDataHandler) CleanAddress(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(dadata.CleanerAPIKey()) == "" {
		http.Error(w, "DaData Cleaner is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	raw, status, err := dadata.CleanAddress(b)
	if err != nil {
		log.Printf("DaData CleanAddress: %v", err)
		http.Error(w, "Upstream error", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCodeOr200(status))
	_, _ = w.Write(raw)
}

func statusCodeOr200(code int) int {
	if code <= 0 {
		return http.StatusOK
	}
	return code
}
