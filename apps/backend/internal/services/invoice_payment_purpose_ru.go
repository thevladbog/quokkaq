package services

import (
	"fmt"
	"strconv"
	"strings"

	"quokkaq-go-backend/internal/models"
)

func formatThousandsAbs(n int64) string {
	if n < 0 {
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	lead := len(s) % 3
	if lead == 0 {
		lead = 3
	}
	b.WriteString(s[:lead])
	for i := lead; i < len(s); i += 3 {
		b.WriteByte(' ')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

// FormatPriceMinorUnitsRU formats minor units as "1 234,56 ₽" (Russian-style grouping).
func FormatPriceMinorUnitsRU(amountMinor int64) string {
	neg := amountMinor < 0
	if neg {
		amountMinor = -amountMinor
	}
	rub := amountMinor / 100
	kop := amountMinor % 100
	s := fmt.Sprintf("%s,%02d ₽", formatThousandsAbs(rub), kop)
	if neg {
		return "-" + s
	}
	return s
}

// RuBankPaymentPurposeFromInvoice matches apps/frontend/lib/invoice-payment-purpose-ru.ts.
func RuBankPaymentPurposeFromInvoice(inv *models.Invoice) string {
	doc := ""
	if inv.DocumentNumber != nil {
		doc = strings.TrimSpace(*inv.DocumentNumber)
	}
	if doc == "" {
		id := inv.ID
		if len(id) > 8 {
			id = id[:8]
		}
		doc = "…" + id
	}
	cur := strings.TrimSpace(inv.Currency)
	if cur == "" {
		cur = "RUB"
	}
	amountStr := FormatPriceMinorUnitsRU(inv.Amount)
	if cur != "RUB" {
		div := int64(100)
		if cur == "JPY" {
			div = 1
		}
		whole := inv.Amount / div
		frac := inv.Amount % div
		if div == 1 {
			amountStr = fmt.Sprintf("%s %s", formatThousandsAbs(whole), cur)
		} else {
			amountStr = fmt.Sprintf("%s,%02d %s", formatThousandsAbs(whole), frac, cur)
		}
	}
	vatMinor := inv.VatTotalMinor
	if vatMinor == 0 && len(inv.Lines) > 0 {
		for _, l := range inv.Lines {
			vatMinor += l.VatAmountMinor
		}
	}
	vatPhrase := "без НДС"
	if vatMinor > 0 {
		vatPhrase = "в т.ч. НДС"
	}
	return fmt.Sprintf(
		"Оплата по счету № %s за услуги предоставления доступа к сервису КвоккаКю на сумму %s, %s.",
		doc,
		amountStr,
		vatPhrase,
	)
}
