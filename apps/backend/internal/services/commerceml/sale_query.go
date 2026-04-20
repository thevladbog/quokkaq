package commerceml

import (
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
)

// BuildSaleQueryXML builds a CommerceML 2.10 fragment with Документ nodes for UNF order import.
// onec may be nil (site payment system name for эквайринг mapping omitted).
func BuildSaleQueryXML(company *models.Company, invoices []models.Invoice, schemaVersion string, onec *models.CompanyOneCSettings) (string, error) {
	if company == nil {
		return "", fmt.Errorf("company is required")
	}
	if schemaVersion == "" {
		schemaVersion = "2.10"
	}
	sitePaySys := ""
	if onec != nil {
		sitePaySys = strings.TrimSpace(onec.SitePaymentSystemName)
	}

	var b strings.Builder
	ts := time.Now().UTC().Format(time.RFC3339)
	fmt.Fprintf(&b, `<?xml version="1.0" encoding="UTF-8"?>`+"\n")
	fmt.Fprintf(&b, `<КоммерческаяИнформация ВерсияСхемы="%s" ДатаФормирования="%s">`+"\n", escapeXML(schemaVersion), escapeXML(ts))

	for i := range invoices {
		inv := &invoices[i]
		docID := strings.TrimSpace(inv.ID)
		if docID == "" {
			continue
		}
		num := docID
		if inv.DocumentNumber != nil && strings.TrimSpace(*inv.DocumentNumber) != "" {
			num = strings.TrimSpace(*inv.DocumentNumber)
		}
		dateStr := inv.IssuedAt
		if dateStr == nil {
			dateStr = &inv.CreatedAt
		}
		day := dateStr.UTC().Format("2006-01-02")
		sumMajor := float64(inv.Amount) / 100.0

		cp := buildCounterpartyExport(company, inv)

		fmt.Fprintf(&b, "  <Документ>\n")
		fmt.Fprintf(&b, "    <Ид>%s</Ид>\n", escapeXML(docID))
		fmt.Fprintf(&b, "    <Номер>%s</Номер>\n", escapeXML(num))
		fmt.Fprintf(&b, "    <Дата>%s</Дата>\n", escapeXML(day))
		fmt.Fprintf(&b, "    <ХозОперация>%s</ХозОперация>\n", escapeXML("Заказ товара"))
		fmt.Fprintf(&b, "    <Роль>%s</Роль>\n", escapeXML("Продавец"))
		fmt.Fprintf(&b, "    <Валюта>%s</Валюта>\n", escapeXML(inv.Currency))
		fmt.Fprintf(&b, "    <Курс>1</Курс>\n")
		fmt.Fprintf(&b, "    <Сумма>%.2f</Сумма>\n", sumMajor)
		fmt.Fprintf(&b, "    <Контрагенты>\n")
		fmt.Fprintf(&b, "      <Контрагент>\n")
		fmt.Fprintf(&b, "        <Ид>%s</Ид>\n", escapeXML(cp.SiteID))
		fmt.Fprintf(&b, "        <Наименование>%s</Наименование>\n", escapeXML(cp.Name))
		if cp.FullName != "" {
			fmt.Fprintf(&b, "        <ПолноеНаименование>%s</ПолноеНаименование>\n", escapeXML(cp.FullName))
		}
		if cp.INN != "" {
			fmt.Fprintf(&b, "        <ИНН>%s</ИНН>\n", escapeXML(cp.INN))
		}
		if cp.KPP != "" {
			fmt.Fprintf(&b, "        <КПП>%s</КПП>\n", escapeXML(cp.KPP))
		}
		fmt.Fprintf(&b, "        <Роль>%s</Роль>\n", escapeXML("Покупатель"))
		fmt.Fprintf(&b, "      </Контрагент>\n")
		fmt.Fprintf(&b, "    </Контрагенты>\n")
		fmt.Fprintf(&b, "    <Товары>\n")
		for j := range inv.Lines {
			line := &inv.Lines[j]
			nomID := ""
			if line.CatalogItem != nil && line.CatalogItem.OneCNomenclatureGUID != nil {
				nomID = strings.TrimSpace(*line.CatalogItem.OneCNomenclatureGUID)
			}
			if nomID == "" && line.CatalogItemID != nil {
				nomID = strings.TrimSpace(*line.CatalogItemID)
			}
			if nomID == "" {
				nomID = line.ID
			}
			lineSum := float64(line.LineGrossMinor) / 100.0
			unitPrice := float64(line.UnitPriceInclVatMinor) / 100.0
			name := line.DescriptionPrint
			if name == "" {
				name = "Line"
			}
			uom := line.MeasureUnit
			if uom == "" {
				uom = "шт"
			}
			fmt.Fprintf(&b, "      <Товар>\n")
			fmt.Fprintf(&b, "        <Ид>%s</Ид>\n", escapeXML(nomID))
			fmt.Fprintf(&b, "        <Наименование>%s</Наименование>\n", escapeXML(name))
			fmt.Fprintf(&b, "        <БазоваяЕдиница Код=\"796\" НаименованиеПолное=\"%s\" МеждународноеСокращение=\"PCE\">%s</БазоваяЕдиница>\n",
				escapeXML(uom), escapeXML(uom))
			fmt.Fprintf(&b, "        <ЦенаЗаЕдиницу>%.2f</ЦенаЗаЕдиницу>\n", unitPrice)
			fmt.Fprintf(&b, "        <Количество>%.4f</Количество>\n", line.Quantity)
			fmt.Fprintf(&b, "        <Сумма>%.2f</Сумма>\n", lineSum)
			fmt.Fprintf(&b, "      </Товар>\n")
		}
		fmt.Fprintf(&b, "    </Товары>\n")
		appendDocumentPayments(&b, inv, sitePaySys)
		fmt.Fprintf(&b, "  </Документ>\n")
	}
	fmt.Fprintf(&b, "</КоммерческаяИнформация>\n")
	return b.String(), nil
}
