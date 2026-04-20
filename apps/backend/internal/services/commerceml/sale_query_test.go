package commerceml

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func TestBuildSaleQueryXML_Minimal(t *testing.T) {
	guid := "550e8400-e29b-41d4-a716-446655440000"
	c := &models.Company{ID: "c1", Name: "ООО Тест", OneCCounterpartyGUID: &guid}
	ts := time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC)
	inv := models.Invoice{
		ID: "inv-1", CompanyID: ptr("c1"), Amount: 10000, Currency: "RUB", Status: "open",
		CreatedAt: ts,
		Lines: []models.InvoiceLine{
			{
				ID: "ln1", DescriptionPrint: "Услуга", Quantity: 1, UnitPriceInclVatMinor: 10000,
				LineGrossMinor: 10000, MeasureUnit: "шт",
				CatalogItem: &models.CatalogItem{OneCNomenclatureGUID: ptr("nom-guid-1")},
			},
		},
	}
	inv.DocumentNumber = ptr("QQ-2026-00001")
	inv.IssuedAt = &ts
	st := &models.CompanyOneCSettings{CommerceMLVersion: "2.10"}
	x, err := BuildSaleQueryXML(c, []models.Invoice{inv}, "2.10", st)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(x, `<Ид>inv-1</Ид>`) {
		t.Fatalf("missing invoice id: %s", x)
	}
	if !strings.Contains(x, "nom-guid-1") {
		t.Fatalf("missing nomenclature guid: %s", x)
	}
	if !strings.Contains(x, guid) {
		t.Fatalf("expected 1C counterparty guid in xml: %s", x)
	}
}

func TestBuildSaleQueryXML_NoPrelinkedGUID_UsesCompanyID(t *testing.T) {
	c := &models.Company{
		ID:           "tenant-uuid-1",
		Name:         "Новый клиент",
		Counterparty: json.RawMessage(`{"inn":"7707083893","legalName":"ООО Новый"}`),
	}
	ts := time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC)
	inv := models.Invoice{
		ID: "inv-2", CompanyID: ptr("tenant-uuid-1"), Amount: 5000, Currency: "RUB", Status: "open",
		CreatedAt: ts,
		Lines: []models.InvoiceLine{
			{ID: "ln1", DescriptionPrint: "X", Quantity: 1, UnitPriceInclVatMinor: 5000, LineGrossMinor: 5000},
		},
	}
	inv.IssuedAt = &ts
	x, err := BuildSaleQueryXML(c, []models.Invoice{inv}, "2.10", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(x, "<Ид>tenant-uuid-1</Ид>") {
		t.Fatalf("expected company id as counterparty Ид: %s", x)
	}
	if !strings.Contains(x, "7707083893") {
		t.Fatalf("expected INN in xml: %s", x)
	}
}

func TestBuildSaleQueryXML_OnlinePayment_Acquiring(t *testing.T) {
	c := &models.Company{ID: "c1", Name: "ООО Тест"}
	ts := time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC)
	inv := models.Invoice{
		ID: "inv-3", CompanyID: ptr("c1"), Amount: 10000, Currency: "RUB", Status: "paid",
		PaymentProvider: "yookassa", PaymentProviderInvoiceID: "ym-abc-999",
		CreatedAt: ts,
		Lines: []models.InvoiceLine{
			{ID: "ln1", DescriptionPrint: "Y", Quantity: 1, UnitPriceInclVatMinor: 10000, LineGrossMinor: 10000},
		},
	}
	inv.IssuedAt = &ts
	inv.PaidAt = &ts
	st := &models.CompanyOneCSettings{SitePaymentSystemName: "YooKassa"}
	x, err := BuildSaleQueryXML(c, []models.Invoice{inv}, "2.10", st)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(x, "Эквайринг") || !strings.Contains(x, "ym-abc-999") {
		t.Fatalf("expected acquiring payment block: %s", x)
	}
	if !strings.Contains(x, "НаименованиеПлатежнойСистемы>YooKassa<") {
		t.Fatalf("expected site payment system name: %s", x)
	}
}

func TestParseOrderDocuments(t *testing.T) {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.10">
  <Документ>
    <Ид>inv-1</Ид>
    <Статус>Оплачен</Статус>
  </Документ>
</КоммерческаяИнформация>`
	docs, err := ParseOrderDocuments([]byte(xml))
	if err != nil {
		t.Fatal(err)
	}
	if len(docs) != 1 || docs[0].ID != "inv-1" || !StatusLooksPaid(docs[0].Status) {
		t.Fatalf("unexpected: %+v", docs)
	}
}

func ptr[T any](v T) *T { return &v }
