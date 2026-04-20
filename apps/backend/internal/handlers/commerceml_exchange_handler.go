package handlers

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services/billing"
	"quokkaq-go-backend/internal/services/commerceml"
	"quokkaq-go-backend/pkg/database"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// CommerceMLExchangeHandler serves Bitrix-style HTTP exchange for 1С УНФ (POC): sale/checkauth, sale/query, sale/import.
type CommerceMLExchangeHandler struct {
	companyRepo repository.CompanyRepository
	invoiceRepo repository.InvoiceRepository
	onecRepo    repository.OneCSettingsRepository
	sessions    *commerceml.SessionStore
}

func NewCommerceMLExchangeHandler(
	companyRepo repository.CompanyRepository,
	invoiceRepo repository.InvoiceRepository,
	onecRepo repository.OneCSettingsRepository,
	sessions *commerceml.SessionStore,
) *CommerceMLExchangeHandler {
	return &CommerceMLExchangeHandler{
		companyRepo: companyRepo,
		invoiceRepo: invoiceRepo,
		onecRepo:    onecRepo,
		sessions:    sessions,
	}
}

// ServeHTTP handles CommerceML HTTP exchange for 1С УНФ (GET/POST on one URL).
// @Summary      CommerceML HTTP exchange (1С УНФ)
// @Description  Bitrix-style protocol: type=sale with mode=checkauth|query|import|file; session from checkauth via sessid or session query param. Import body is CommerceML XML (up to 8 MiB).
// @Tags         CommerceML
// @ID           CommerceMLExchange
// @Accept       application/xml
// @Produce      text/plain
// @Produce      application/xml
// @Param        type    query string false "Protocol branch (e.g. sale)"
// @Param        mode    query string false "checkauth, query, import, file"
// @Param        sessid  query string false "Session id returned by checkauth"
// @Param        session query string false "Alias for sessid"
// @Success      200 {string} string "Plain-text success/failure lines or sale/query XML"
// @Failure      400 {string} string "Bad request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      429 {string} string "Too many requests"
// @Failure      500 {string} string "Internal error"
// @Router       /commerceml/exchange [get]
// @Router       /commerceml/exchange [post]
func (h *CommerceMLExchangeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	typ := strings.TrimSpace(q.Get("type"))
	mode := strings.TrimSpace(strings.ToLower(q.Get("mode")))

	if typ == "sale" && mode == "checkauth" {
		h.saleCheckauth(w, r)
		return
	}

	sess := strings.TrimSpace(q.Get("sessid"))
	if sess == "" {
		sess = strings.TrimSpace(q.Get("session"))
	}
	companyID, ok := h.sessions.CompanyID(sess)
	if !ok {
		http.Error(w, "failure\nsession expired or missing sessid\n", http.StatusUnauthorized)
		return
	}

	switch {
	case typ == "sale" && mode == "query":
		h.saleQuery(w, r, companyID)
	case typ == "sale" && (mode == "import" || mode == "file"):
		h.saleImport(w, r, companyID)
	default:
		http.Error(w, "failure\nunsupported type/mode\n", http.StatusBadRequest)
	}
}

func (h *CommerceMLExchangeHandler) saleCheckauth(w http.ResponseWriter, r *http.Request) {
	user, pass, ok := r.BasicAuth()
	if !ok {
		w.Header().Set("WWW-Authenticate", `Basic realm="CommerceML"`)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user = strings.TrimSpace(user)
	if user == "" || pass == "" {
		http.Error(w, "failure\nmissing credentials\n", http.StatusUnauthorized)
		return
	}

	st, err := h.onecRepo.FindByHTTPLogin(user)
	if err != nil {
		if errors.Is(err, repository.ErrOneCSettingsNotFound) {
			http.Error(w, "failure\nunknown login\n", http.StatusUnauthorized)
			return
		}
		logger.ErrorfCtx(r.Context(), "commerceml FindByHTTPLogin: %v", err)
		http.Error(w, "failure\ninternal error\n", http.StatusInternalServerError)
		return
	}
	if !st.ExchangeEnabled {
		http.Error(w, "failure\nexchange disabled\n", http.StatusForbidden)
		return
	}
	if st.HTTPPasswordBcrypt == "" {
		http.Error(w, "failure\npassword not configured\n", http.StatusForbidden)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(st.HTTPPasswordBcrypt), []byte(pass)) != nil {
		http.Error(w, "failure\ninvalid password\n", http.StatusUnauthorized)
		return
	}

	token, err := h.sessions.Create(st.CompanyID)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "commerceml session Create: %v", err)
		http.Error(w, "failure\nsession\n", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	loginOut := strings.TrimSpace(st.HTTPLogin)
	_, _ = w.Write([]byte("success\n" + loginOut + "\n" + token + "\n"))
}

func (h *CommerceMLExchangeHandler) saleQuery(w http.ResponseWriter, r *http.Request, companyID string) {
	c, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		http.Error(w, "failure\ncompany\n", http.StatusInternalServerError)
		return
	}
	st, err := h.onecRepo.GetByCompanyID(companyID)
	if err != nil {
		http.Error(w, "failure\nsettings\n", http.StatusInternalServerError)
		return
	}
	if !st.ExchangeEnabled {
		http.Error(w, "failure\nexchange disabled\n", http.StatusForbidden)
		return
	}
	invoices, err := h.invoiceRepo.FindNonDraftWithLinesForCompany(companyID)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "commerceml saleQuery: %v", err)
		http.Error(w, "failure\nload invoices\n", http.StatusInternalServerError)
		return
	}
	xml, err := commerceml.BuildSaleQueryXML(c, invoices, st.CommerceMLVersion, st)
	if err != nil {
		logger.PrintfCtx(r.Context(), "commerceml saleQuery build: %v", err)
		http.Error(w, "failure\n"+err.Error()+"\n", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	ids := make([]string, 0, len(invoices))
	for i := range invoices {
		if id := strings.TrimSpace(invoices[i].ID); id != "" {
			ids = append(ids, id)
		}
	}
	if err := h.invoiceRepo.StampOneCExchangeBatch(companyID, ids, now); err != nil {
		logger.ErrorfCtx(r.Context(), "commerceml saleQuery stamp batch: %v", err)
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	//nosec G705 -- XML from BuildSaleQueryXML (server-built); not reflected user HTML
	_, _ = w.Write([]byte(xml))
}

func (h *CommerceMLExchangeHandler) saleImport(w http.ResponseWriter, r *http.Request, companyID string) {
	st, err := h.onecRepo.GetByCompanyID(companyID)
	if err != nil {
		http.Error(w, "failure\nsettings\n", http.StatusInternalServerError)
		return
	}
	if !st.ExchangeEnabled {
		http.Error(w, "failure\nexchange disabled\n", http.StatusForbidden)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		http.Error(w, "failure\nread body\n", http.StatusBadRequest)
		return
	}
	docs, err := commerceml.ParseOrderDocuments(body)
	if err != nil {
		logger.PrintfCtx(r.Context(), "commerceml import parse: %v", err)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		// Respond success so broken payloads do not trigger aggressive 1C retries.
		_, _ = w.Write([]byte("success\n"))
		return
	}
	mappingJSON := st.StatusMappingJSON
	now := time.Now().UTC()
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		for i := range docs {
			target, ok := commerceml.ResolveInvoiceStatus(docs[i].Status, mappingJSON)
			if !ok {
				continue
			}
			if err := tx.Where("id = ? AND company_id = ?", docs[i].ID, companyID).First(new(models.Invoice)).Error; err != nil {
				logger.PrintfCtx(r.Context(), "commerceml import skip invoice %s: %v", docs[i].ID, err)
				continue
			}
			switch target {
			case "paid":
				if err := billing.ApplyOneCInvoicePaid(tx, docs[i].ID, companyID, now, now); err != nil {
					return err
				}
			case "void", "uncollectible":
				if err := billing.ApplyOneCInvoiceVoidOrUncollectible(tx, docs[i].ID, companyID, target, now); err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		logger.ErrorfCtx(r.Context(), "commerceml import transaction: %v", err)
		http.Error(w, "failure\nimport\n", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("success\n"))
}
