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

// ProvisionInvoiceSubscriptionFromLines creates company subscription from the single license line when configured.
func ProvisionInvoiceSubscriptionFromLines(tx *gorm.DB, inv *models.Invoice, now time.Time) error {
	var locked models.Invoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		First(&locked, "id = ?", inv.ID).Error; err != nil {
		return err
	}
	if !locked.ProvisionSubscriptionsOnPayment || locked.ProvisioningDoneAt != nil {
		return nil
	}

	var lic *models.InvoiceLine
	for i := range locked.Lines {
		ln := locked.Lines[i]
		if ln.SubscriptionPlanID != nil && strings.TrimSpace(*ln.SubscriptionPlanID) != "" {
			if lic != nil {
				p1 := strings.TrimSpace(*lic.SubscriptionPlanID)
				p2 := strings.TrimSpace(*ln.SubscriptionPlanID)
				return fmt.Errorf(
					"multiple subscription-plan lines on invoice %s: line id=%q position=%d plan=%q vs line id=%q position=%d plan=%q",
					locked.ID, lic.ID, lic.Position, p1, ln.ID, ln.Position, p2,
				)
			}
			lcopy := ln
			lic = &lcopy
		}
	}
	if lic == nil {
		return fmt.Errorf(
			"invoice %s: provisionSubscriptionsOnPayment is set but no line with subscriptionPlanId",
			locked.ID,
		)
	}
	if lic.SubscriptionPeriodStart == nil {
		return fmt.Errorf(
			"invoice %s: license line missing subscription period start",
			locked.ID,
		)
	}
	if lic.SubscriptionPeriodEnd == nil {
		return fmt.Errorf(
			"invoice %s: license line missing subscription period end",
			locked.ID,
		)
	}
	if locked.CompanyID == nil {
		return fmt.Errorf("invoice %s: company id is required for provisioning", locked.ID)
	}
	companyID := *locked.CompanyID
	planID := strings.TrimSpace(*lic.SubscriptionPlanID)
	start := lic.SubscriptionPeriodStart.UTC()
	end := lic.SubscriptionPeriodEnd.UTC()

	sub, err := CreateSubscriptionForCompanyTx(tx, now, companyID, planID, "active", start, end, nil)
	if err != nil {
		return err
	}
	sid := sub.ID
	return tx.Model(&models.Invoice{}).Where("id = ?", locked.ID).Updates(map[string]interface{}{
		"subscription_id":      sid,
		"provisioning_done_at": now,
	}).Error
}

// ApplyYooKassaInvoicePaid marks invoice paid (idempotent) and provisions subscription when configured.
func ApplyYooKassaInvoicePaid(tx *gorm.DB, invoiceID, paymentID string, paidAt time.Time, now time.Time) error {
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("invoice %s: %w", invoiceID, err)
		}
		return err
	}
	if strings.TrimSpace(inv.YookassaPaymentID) != "" && inv.YookassaPaymentID != paymentID {
		return errors.New("payment id does not match invoice")
	}
	if inv.Status == "paid" {
		return nil
	}

	updates := map[string]interface{}{
		"status":                      "paid",
		"paid_at":                     paidAt,
		"payment_provider":            "yookassa",
		"payment_provider_invoice_id": paymentID,
		"yookassa_payment_id":         paymentID,
	}
	if err := tx.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(updates).Error; err != nil {
		return err
	}
	inv.Status = "paid"
	return ProvisionInvoiceSubscriptionFromLines(tx, &inv, now)
}
