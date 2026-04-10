package handlers

import (
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services/billing"

	"gorm.io/gorm"
)

// maybeProvisionAfterManualPaid runs subscription provisioning when platform marks invoice paid manually.
func maybeProvisionAfterManualPaid(tx *gorm.DB, invoiceID string, now time.Time) error {
	var inv models.Invoice
	if err := tx.Preload("Lines").First(&inv, "id = ?", invoiceID).Error; err != nil {
		return err
	}
	if strings.TrimSpace(inv.Status) != "paid" {
		return nil
	}
	return billing.ProvisionInvoiceSubscriptionFromLines(tx, &inv, now)
}
