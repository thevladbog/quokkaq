package handlers

import (
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// provisionInvoiceSubscriptionFromLines creates company subscription from the single license line when configured.
func provisionInvoiceSubscriptionFromLines(tx *gorm.DB, inv *models.Invoice, now time.Time) error {
	if !inv.ProvisionSubscriptionsOnPayment || inv.ProvisioningDoneAt != nil {
		return nil
	}
	var lic *models.InvoiceLine
	for i := range inv.Lines {
		ln := inv.Lines[i]
		if ln.SubscriptionPlanID != nil && strings.TrimSpace(*ln.SubscriptionPlanID) != "" {
			if lic != nil {
				return nil
			}
			lcopy := ln
			lic = &lcopy
		}
	}
	if lic == nil || lic.SubscriptionPeriodStart == nil || lic.SubscriptionPeriodEnd == nil {
		return nil
	}
	if inv.CompanyID == nil {
		return nil
	}
	companyID := *inv.CompanyID
	planID := strings.TrimSpace(*lic.SubscriptionPlanID)
	start := lic.SubscriptionPeriodStart.UTC()
	end := lic.SubscriptionPeriodEnd.UTC()

	sub, err := platformCreateSubscriptionForCompanyTx(tx, now, companyID, planID, "active", start, end, nil)
	if err != nil {
		return err
	}
	sid := sub.ID
	return tx.Model(&models.Invoice{}).Where("id = ?", inv.ID).Updates(map[string]interface{}{
		"subscription_id":      sid,
		"provisioning_done_at": now,
	}).Error
}

// applyYooKassaInvoicePaid marks invoice paid (idempotent) and provisions subscription when configured.
func applyYooKassaInvoicePaid(tx *gorm.DB, invoiceID, paymentID string, paidAt time.Time, now time.Time) error {
	invoiceID = strings.TrimSpace(invoiceID)
	if invoiceID == "" {
		return errors.New("missing invoice id")
	}
	var inv models.Invoice
	if err := tx.Preload("Lines").First(&inv, "id = ?", invoiceID).Error; err != nil {
		return err
	}
	if inv.Status == "paid" {
		return nil
	}
	if strings.TrimSpace(inv.YookassaPaymentID) != "" && inv.YookassaPaymentID != paymentID {
		return errors.New("payment id does not match invoice")
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
	return provisionInvoiceSubscriptionFromLines(tx, &inv, now)
}

// maybeProvisionAfterManualPaid runs subscription provisioning when platform marks invoice paid manually.
func maybeProvisionAfterManualPaid(tx *gorm.DB, invoiceID string, now time.Time) error {
	var inv models.Invoice
	if err := tx.Preload("Lines").First(&inv, "id = ?", invoiceID).Error; err != nil {
		return err
	}
	if inv.Status != "paid" {
		return nil
	}
	return provisionInvoiceSubscriptionFromLines(tx, &inv, now)
}
