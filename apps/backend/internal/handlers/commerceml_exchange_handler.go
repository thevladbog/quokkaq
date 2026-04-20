package handlers

import (
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
	pass = strings.TrimSpace(pass)
	if user == "" || pass == "" {
		http.Error(w, "failure\nmissing credentials\n", http.StatusUnauthorized)
		return
	}

	st, err := h.onecRepo.FindByHTTPLogin(user)
	if err != nil {
		http.Error(w, "failure\nunknown login\n", http.StatusUnauthorized)
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

	token := h.sessions.Create(st.CompanyID)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("success\n" + user + "\n" + token + "\n"))
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
	for i := range invoices {
		id := invoices[i].ID
		if err := database.DB.Model(&models.Invoice{}).Where("id = ?", id).Updates(map[string]interface{}{
			"onec_order_site_id":    id,
			"onec_last_exchange_at": now,
		}).Error; err != nil {
			logger.ErrorfCtx(r.Context(), "commerceml saleQuery stamp invoice: %v", err)
		}
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	_, _ = w.Write([]byte(xml))
}

func (h *CommerceMLExchangeHandler) saleImport(w http.ResponseWriter, r *http.Request, companyID string) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		http.Error(w, "failure\nread body\n", http.StatusBadRequest)
		return
	}
	docs, err := commerceml.ParseOrderDocuments(body)
	if err != nil {
		logger.PrintfCtx(r.Context(), "commerceml import parse: %v", err)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("success\n"))
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
	mappingJSON := st.StatusMappingJSON
	now := time.Now().UTC()
	_ = database.DB.Transaction(func(tx *gorm.DB) error {
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
				if err := billing.ApplyOneCInvoicePaid(tx, docs[i].ID, now, now); err != nil {
					logger.PrintfCtx(r.Context(), "commerceml import paid %s: %v", docs[i].ID, err)
				}
			case "void", "uncollectible":
				if err := billing.ApplyOneCInvoiceVoidOrUncollectible(tx, docs[i].ID, companyID, target, now); err != nil {
					logger.PrintfCtx(r.Context(), "commerceml import %s %s: %v", target, docs[i].ID, err)
				}
			}
		}
		return nil
	})
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("success\n"))
}
