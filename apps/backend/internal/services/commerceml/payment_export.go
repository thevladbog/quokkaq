package commerceml

import (
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// onlineAcquiringPaymentDoc returns payment document number and date for CommerceML Эквайринг block.
// Per 1С methodical docs, Номер платежного документа and Дата оплаты must be set for import.
func onlineAcquiringPaymentDoc(inv *models.Invoice) (docNum string, paidDay string, ok bool) {
	if inv == nil || inv.Status != "paid" || inv.PaidAt == nil {
		return "", "", false
	}
	p := strings.TrimSpace(strings.ToLower(inv.PaymentProvider))
	if p != "yookassa" && p != "stripe" {
		return "", "", false
	}
	docNum = strings.TrimSpace(inv.PaymentProviderInvoiceID)
	if docNum == "" {
		docNum = strings.TrimSpace(inv.YookassaPaymentID)
	}
	if docNum == "" {
		docNum = strings.TrimSpace(inv.StripeSessionID)
	}
	if docNum == "" {
		return "", "", false
	}
	paidDay = inv.PaidAt.UTC().Format("2006-01-02")
	return docNum, paidDay, true
}

// appendDocumentPayments writes <Оплаты> for online acquiring when applicable.
func appendDocumentPayments(b *strings.Builder, inv *models.Invoice, sitePaymentSystemName string) {
	docNum, paidDay, ok := onlineAcquiringPaymentDoc(inv)
	if !ok {
		return
	}
	sumMajor := float64(inv.Amount) / 100.0
	fmt.Fprintf(b, "    <Оплаты>\n")
	fmt.Fprintf(b, "      <Оплата>\n")
	fmt.Fprintf(b, "        <Дата>%s</Дата>\n", escapeXML(paidDay))
	fmt.Fprintf(b, "        <Сумма>%.2f</Сумма>\n", sumMajor)
	fmt.Fprintf(b, "        <ВидОплаты>%s</ВидОплаты>\n", escapeXML("Эквайринг"))
	fmt.Fprintf(b, "        <НомерПлатежногоДокумента>%s</НомерПлатежногоДокумента>\n", escapeXML(docNum))
	if s := strings.TrimSpace(sitePaymentSystemName); s != "" {
		fmt.Fprintf(b, "        <НаименованиеПлатежнойСистемы>%s</НаименованиеПлатежнойСистемы>\n", escapeXML(s))
	}
	fmt.Fprintf(b, "      </Оплата>\n")
	fmt.Fprintf(b, "    </Оплаты>\n")
}
