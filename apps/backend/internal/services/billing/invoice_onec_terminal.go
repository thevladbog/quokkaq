package billing

import (
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ApplyOneCInvoiceVoidOrUncollectible sets invoice status from 1С import (idempotent).
// Does not change already paid invoices (1C is source of truth for money; avoid accidental reversal).
func ApplyOneCInvoiceVoidOrUncollectible(tx *gorm.DB, invoiceID, companyID string, status string, now time.Time) error {
	invoiceID = strings.TrimSpace(invoiceID)
	if invoiceID == "" {
		return errors.New("missing invoice id")
	}
	companyID = strings.TrimSpace(companyID)
	if companyID == "" {
		return errors.New("missing company id")
	}
	status = strings.TrimSpace(strings.ToLower(status))
	if status != "void" && status != "uncollectible" {
		return errors.New("invalid terminal status")
	}
	var inv models.Invoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&inv, "id = ? AND company_id = ?", invoiceID, companyID).Error; err != nil {
		return err
	}
	if inv.Status == status {
		return nil
	}
	if inv.Status == "paid" {
		return nil
	}
	if inv.Status != "draft" && inv.Status != "open" {
		return nil
	}
	updates := map[string]interface{}{
		"status":           status,
		"updated_at":       now,
		"payment_provider": "manual",
	}
	return tx.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(updates).Error
}
