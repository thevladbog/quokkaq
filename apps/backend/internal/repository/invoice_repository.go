package repository

import (
	"errors"
	"fmt"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// ErrInvoiceYooKassaPaymentAlreadyLinked is returned when UpdateYookassaPayment cannot persist
// because the invoice is already linked to a different external payment id.
var ErrInvoiceYooKassaPaymentAlreadyLinked = errors.New("invoice already linked to a different payment")

const (
	invoiceListDefaultLimit = 50
	invoiceListMaxLimit     = 100
)

func clampInvoiceListPagination(limit, offset int) (int, int) {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = invoiceListDefaultLimit
	}
	if limit > invoiceListMaxLimit {
		limit = invoiceListMaxLimit
	}
	return limit, offset
}

type InvoiceRepository interface {
	Create(invoice *models.Invoice) error
	FindByID(id string) (*models.Invoice, error)
	FindByIDWithLines(id string) (*models.Invoice, error)
	// FindByIDWithLinesForCompany scopes the row to a tenant company (404 when missing or wrong company).
	FindByIDWithLinesForCompany(id, companyID string) (*models.Invoice, error)
	FindByCompanyID(companyID string) ([]models.Invoice, error)
	FindByCompanyIDNonDraft(companyID string) ([]models.Invoice, error)
	ListPaginated(companyID *string, limit, offset int) ([]models.Invoice, int64, error)
	Update(invoice *models.Invoice) error
	UpdateYookassaPayment(id, paymentID, confirmationURL string) error
	Delete(id string) error
	CreateWithLinesInTx(tx *gorm.DB, invoice *models.Invoice, lines []models.InvoiceLine) error
	UpdateHeaderAndLinesInTx(tx *gorm.DB, invoice *models.Invoice, lines []models.InvoiceLine) error
	AllocateDocumentNumber(tx *gorm.DB, year int) (string, error)
}

type invoiceRepository struct{}

func NewInvoiceRepository() InvoiceRepository {
	return &invoiceRepository{}
}

func (r *invoiceRepository) Create(invoice *models.Invoice) error {
	return database.DB.Create(invoice).Error
}

func (r *invoiceRepository) FindByID(id string) (*models.Invoice, error) {
	var invoice models.Invoice
	err := database.DB.Where("id = ?", id).First(&invoice).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *invoiceRepository) FindByIDWithLines(id string) (*models.Invoice, error) {
	var invoice models.Invoice
	err := database.DB.
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lines.SubscriptionPlan").
		Preload("Company").
		Preload("Subscription.Plan").
		First(&invoice, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *invoiceRepository) FindByIDWithLinesForCompany(id, companyID string) (*models.Invoice, error) {
	var invoice models.Invoice
	err := database.DB.
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Lines.SubscriptionPlan").
		Preload("Company").
		Preload("Subscription.Plan").
		Where("id = ? AND company_id = ?", id, companyID).
		First(&invoice).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *invoiceRepository) FindByCompanyID(companyID string) ([]models.Invoice, error) {
	var invoices []models.Invoice
	err := database.DB.Where("company_id = ?", companyID).
		Order("created_at DESC, id DESC").
		Find(&invoices).Error
	return invoices, err
}

// FindByCompanyIDNonDraft returns issued invoices only (excludes platform drafts).
func (r *invoiceRepository) FindByCompanyIDNonDraft(companyID string) ([]models.Invoice, error) {
	var invoices []models.Invoice
	err := database.DB.Where("company_id = ? AND status <> ?", companyID, "draft").
		Order("created_at DESC, id DESC").
		Find(&invoices).Error
	return invoices, err
}

func (r *invoiceRepository) ListPaginated(companyID *string, limit, offset int) ([]models.Invoice, int64, error) {
	limit, offset = clampInvoiceListPagination(limit, offset)

	base := database.DB.Model(&models.Invoice{})
	if companyID != nil && *companyID != "" {
		base = base.Where("company_id = ?", *companyID)
	}

	var total int64
	countQ := base.Session(&gorm.Session{})
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var invoices []models.Invoice
	listQ := base.Session(&gorm.Session{}).
		Preload("Subscription.Plan").
		Order("created_at DESC, id DESC").
		Limit(limit).
		Offset(offset)
	err := listQ.Find(&invoices).Error
	return invoices, total, err
}

func (r *invoiceRepository) Update(invoice *models.Invoice) error {
	return database.DB.Save(invoice).Error
}

// UpdateYookassaPayment persists YooKassa payment id, confirmation URL, and provider fields after CreatePayment.
// It only succeeds when the row has no payment ids yet or is already linked to the same paymentID.
func (r *invoiceRepository) UpdateYookassaPayment(id, paymentID, confirmationURL string) error {
	if id == "" || paymentID == "" {
		return fmt.Errorf("UpdateYookassaPayment: empty id or paymentID")
	}
	result := database.DB.Model(&models.Invoice{}).
		Where("id = ?", id).
		Where(`(
			(yookassa_payment_id IS NULL OR yookassa_payment_id = '')
			AND (payment_provider_invoice_id IS NULL OR payment_provider_invoice_id = '')
		) OR yookassa_payment_id = ? OR payment_provider_invoice_id = ?`,
			paymentID, paymentID).
		Updates(map[string]interface{}{
			"yookassa_payment_id":         paymentID,
			"yookassa_confirmation_url":   confirmationURL,
			"payment_provider":            "yookassa",
			"payment_provider_invoice_id": paymentID,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInvoiceYooKassaPaymentAlreadyLinked
	}
	return nil
}

func (r *invoiceRepository) Delete(id string) error {
	return database.DB.Delete(&models.Invoice{}, "id = ?", id).Error
}

func (r *invoiceRepository) CreateWithLinesInTx(tx *gorm.DB, invoice *models.Invoice, lines []models.InvoiceLine) error {
	if err := tx.Create(invoice).Error; err != nil {
		return err
	}
	for i := range lines {
		lines[i].InvoiceID = invoice.ID
		lines[i].Position = i + 1
	}
	if len(lines) == 0 {
		return nil
	}
	return tx.Create(&lines).Error
}

func (r *invoiceRepository) UpdateHeaderAndLinesInTx(tx *gorm.DB, invoice *models.Invoice, lines []models.InvoiceLine) error {
	if err := tx.Save(invoice).Error; err != nil {
		return err
	}
	if err := tx.Where("invoice_id = ?", invoice.ID).Delete(&models.InvoiceLine{}).Error; err != nil {
		return err
	}
	for i := range lines {
		lines[i].InvoiceID = invoice.ID
		lines[i].Position = i + 1
		lines[i].ID = ""
		if err := tx.Create(&lines[i]).Error; err != nil {
			return err
		}
	}
	return nil
}

// AllocateDocumentNumber returns next QQ-YYYY-NNNNN for the given calendar year (UTC).
func (r *invoiceRepository) AllocateDocumentNumber(tx *gorm.DB, year int) (string, error) {
	var seq int64
	err := tx.Raw(`
		INSERT INTO invoice_number_sequences (year, last_seq) VALUES (?, 1)
		ON CONFLICT (year) DO UPDATE SET last_seq = invoice_number_sequences.last_seq + 1
		RETURNING last_seq
	`, year).Scan(&seq).Error
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("QQ-%d-%05d", year, seq), nil
}

// InvoiceYearUTC returns calendar year for document numbering.
func InvoiceYearUTC(t time.Time) int {
	return t.UTC().Year()
}
