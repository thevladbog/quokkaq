package billing

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ApplyOneCInvoicePaid marks invoice paid from 1С CommerceML status import (idempotent).
func ApplyOneCInvoicePaid(tx *gorm.DB, invoiceID string, paidAt time.Time, now time.Time) error {
	invoiceID = strings.TrimSpace(invoiceID)
	if invoiceID == "" {
		return errors.New("missing invoice id")
	}
	var inv models.Invoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		First(&inv, "id = ?", invoiceID).Error; err != nil {
		return err
	}
	if inv.Status == "paid" {
		return nil
	}
	extID := "onec:" + inv.ID
	updates := map[string]interface{}{
		"status":                      "paid",
		"paid_at":                     paidAt,
		"payment_provider":            "manual",
		"payment_provider_invoice_id": extID,
	}
	if err := tx.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(updates).Error; err != nil {
		return err
	}
	inv.Status = "paid"
	if err := ProvisionInvoiceSubscriptionFromLines(tx, &inv, now); err != nil {
		return fmt.Errorf("onec paid provision: %w", err)
	}
	return nil
}
