package services

import "strings"

// InvoicePDFPrerequisitesUserMessage is an end-user hint for HTTP 422 when PDF/QR cannot be built.
func InvoicePDFPrerequisitesUserMessage(locale string) string {
	switch strings.ToLower(strings.TrimSpace(locale)) {
	case "ru":
		return "Не удалось сформировать счёт: у оператора SaaS не настроен счёт по умолчанию в рублях или не заполнены поля для QR-кода оплаты (ST00012)."
	default:
		return "Cannot generate invoice PDF: payment QR prerequisites are not met (SaaS operator default RUB bank account and valid ST00012 fields)."
	}
}
