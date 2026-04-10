package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/integrations/dadata"
)

// DaDataPassthroughRequest is JSON forwarded verbatim to DaData Suggestions (shape per DaData docs: query, count, filters, etc.).
type DaDataPassthroughRequest map[string]interface{}

// DaDataCleanRequest is JSON forwarded to DaData Cleaner (typically an array of address strings/objects per DaData docs).
type DaDataCleanRequest map[string]interface{}

// DaDataUpstreamResponse is the JSON body returned from DaData; structure depends on endpoint.
type DaDataUpstreamResponse map[string]interface{}

// DaDataFindPartyByInnRequest is the JSON body for find-by-INN; the handler builds DaData findById/party payload from it.
type DaDataFindPartyByInnRequest struct {
	Inn  string  `json:"inn" binding:"required" example:"7707083893"`
	KPP  *string `json:"kpp,omitempty"`
	Type *string `json:"type,omitempty"`
}

// maxDaDataRequestBodyBytes caps proxied DaData JSON bodies (defense in depth vs unbounded ReadAll).
const maxDaDataRequestBodyBytes = 1 << 20 // 1 MiB

func readDaDataRequestBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}
	limited := http.MaxBytesReader(w, r.Body, maxDaDataRequestBodyBytes)
	return io.ReadAll(limited)
}

// maxBytesReaderExceeded matches net/http MaxBytesReader's error when the body is larger than the limit.
func maxBytesReaderExceeded(err error) bool {
	return err != nil && strings.Contains(err.Error(), "request body too large")
}

// DaDataHandler proxies DaData Suggestions/Cleaner (no keys to the browser).
type DaDataHandler struct{}

func NewDaDataHandler() *DaDataHandler {
	return &DaDataHandler{}
}

// FindPartyByInn godoc
// @Summary      DaData: organization by INN (findById/party)
// @Description  Authenticated proxy to DaData findById/party. Requires JSON field inn; optional kpp and type are forwarded to DaData when set.
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Param        body  body      DaDataFindPartyByInnRequest  true  "INN and optional KPP/type"
// @Success      200   {object}  DaDataUpstreamResponse         "Raw DaData JSON (HTTP status may mirror upstream)"
// @Failure      400   {string}  string                         "Bad request or inn is required"
// @Failure      401   {string}  string                         "Unauthorized"
// @Failure      413   {string}  string                         "request body too large"
// @Failure      500   {string}  string                         "Internal error"
// @Failure      502   {string}  string                         "Upstream error"
// @Failure      503   {string}  string                         "DaData is not configured"
// @Security     BearerAuth
// @Router       /companies/dadata/party/find-by-inn [post]
// @Router       /platform/dadata/party/find-by-inn [post]
func (h *DaDataHandler) FindPartyByInn(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := readDaDataRequestBody(w, r)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	var body DaDataFindPartyByInnRequest
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
// @Description  Authenticated proxy to DaData party suggestions; request body is forwarded unchanged (see DaData Suggestions API).
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Param        body  body      DaDataPassthroughRequest  true  "DaData party suggest JSON"
// @Success      200   {object}  DaDataUpstreamResponse    "Raw DaData JSON (HTTP status may mirror upstream)"
// @Failure      400   {string}  string                    "Bad request"
// @Failure      401   {string}  string                    "Unauthorized"
// @Failure      413   {string}  string                    "request body too large"
// @Failure      502   {string}  string                    "Upstream error"
// @Failure      503   {string}  string                    "DaData is not configured"
// @Security     BearerAuth
// @Router       /companies/dadata/party/suggest [post]
// @Router       /platform/dadata/party/suggest [post]
func (h *DaDataHandler) SuggestParty(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := readDaDataRequestBody(w, r)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
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
// @Description  Authenticated proxy to DaData address suggestions; request body is forwarded unchanged (see DaData Suggestions API).
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Param        body  body      DaDataPassthroughRequest  true  "DaData address suggest JSON"
// @Success      200   {object}  DaDataUpstreamResponse    "Raw DaData JSON (HTTP status may mirror upstream)"
// @Failure      400   {string}  string                    "Bad request"
// @Failure      401   {string}  string                    "Unauthorized"
// @Failure      413   {string}  string                    "request body too large"
// @Failure      502   {string}  string                    "Upstream error"
// @Failure      503   {string}  string                    "DaData is not configured"
// @Security     BearerAuth
// @Router       /companies/dadata/address/suggest [post]
// @Router       /platform/dadata/address/suggest [post]
func (h *DaDataHandler) SuggestAddress(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := readDaDataRequestBody(w, r)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
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

// SuggestBank godoc
// @Summary      DaData: bank suggestions by BIC/name (passthrough body)
// @Description  Authenticated proxy to DaData bank suggestions; request body is forwarded unchanged (see DaData Suggestions API).
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Param        body  body      DaDataPassthroughRequest  true  "DaData bank suggest JSON"
// @Success      200   {object}  DaDataUpstreamResponse    "Raw DaData JSON (HTTP status may mirror upstream)"
// @Failure      400   {string}  string                    "Bad request"
// @Failure      401   {string}  string                    "Unauthorized"
// @Failure      413   {string}  string                    "request body too large"
// @Failure      502   {string}  string                    "Upstream error"
// @Failure      503   {string}  string                    "DaData is not configured"
// @Security     BearerAuth
// @Router       /companies/dadata/bank/suggest [post]
// @Router       /platform/dadata/bank/suggest [post]
func (h *DaDataHandler) SuggestBank(w http.ResponseWriter, r *http.Request) {
	dc, err := dadata.NewClientFromEnv()
	if err != nil {
		http.Error(w, "DaData is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := readDaDataRequestBody(w, r)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	raw, status, err := dc.SuggestBank(b)
	if err != nil {
		log.Printf("DaData SuggestBank: %v", err)
		http.Error(w, "Upstream error", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCodeOr200(status))
	_, _ = w.Write(raw)
}

// CleanAddress godoc
// @Summary      DaData Cleaner: standardize address strings
// @Description  Authenticated proxy to DaData Cleaner; request body is forwarded unchanged (see DaData Cleaner API). Requires cleaner API key on the server.
// @Tags         dadata
// @Accept       json
// @Produce      json
// @Param        body  body      DaDataCleanRequest        true  "DaData cleaner request JSON"
// @Success      200   {object}  DaDataUpstreamResponse    "Raw DaData JSON (HTTP status may mirror upstream)"
// @Failure      400   {string}  string                    "Bad request"
// @Failure      401   {string}  string                    "Unauthorized"
// @Failure      413   {string}  string                    "request body too large"
// @Failure      502   {string}  string                    "Upstream error"
// @Failure      503   {string}  string                    "DaData Cleaner is not configured"
// @Security     BearerAuth
// @Router       /companies/dadata/address/clean [post]
// @Router       /platform/dadata/address/clean [post]
func (h *DaDataHandler) CleanAddress(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(dadata.CleanerAPIKey()) == "" {
		http.Error(w, "DaData Cleaner is not configured", http.StatusServiceUnavailable)
		return
	}
	b, err := readDaDataRequestBody(w, r)
	if err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
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
