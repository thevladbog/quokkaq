package billing

import (
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ApplyOneCInvoicePaid marks invoice paid from 1С CommerceML status import (idempotent).
// companyID scopes the row; provisioning runs before the status flip; already-paid rows retry provisioning only.
func ApplyOneCInvoicePaid(tx *gorm.DB, invoiceID, companyID string, paidAt time.Time, now time.Time) error {
	invoiceID = strings.TrimSpace(invoiceID)
	companyID = strings.TrimSpace(companyID)
	if invoiceID == "" || companyID == "" {
		return errors.New("missing invoice id or company id")
	}
	var inv models.Invoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Where("id = ? AND company_id = ?", invoiceID, companyID).
		First(&inv).Error; err != nil {
		return err
	}
	if inv.Status == "paid" {
		return ProvisionInvoiceSubscriptionFromLines(tx, &inv, now)
	}
	if err := ProvisionInvoiceSubscriptionFromLines(tx, &inv, now); err != nil {
		return err
	}
	extID := "onec:" + inv.ID
	updates := map[string]interface{}{
		"status":                      "paid",
		"paid_at":                     paidAt,
		"payment_provider":            "manual",
		"payment_provider_invoice_id": extID,
	}
	return tx.Model(&models.Invoice{}).Where("id = ? AND company_id = ?", inv.ID, companyID).Updates(updates).Error
}
