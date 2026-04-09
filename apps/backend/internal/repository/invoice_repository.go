package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

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
	FindByCompanyID(companyID string) ([]models.Invoice, error)
	ListPaginated(companyID *string, limit, offset int) ([]models.Invoice, int64, error)
	Update(invoice *models.Invoice) error
	Delete(id string) error
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

func (r *invoiceRepository) FindByCompanyID(companyID string) ([]models.Invoice, error) {
	var invoices []models.Invoice
	err := database.DB.Where("company_id = ?", companyID).
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

func (r *invoiceRepository) Delete(id string) error {
	return database.DB.Delete(&models.Invoice{}, "id = ?", id).Error
}
