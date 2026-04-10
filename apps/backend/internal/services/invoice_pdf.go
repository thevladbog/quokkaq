package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"

	"quokkaq-go-backend/internal/assets"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ruqr"

	"github.com/signintech/gopdf"
	qrcode "github.com/skip2/go-qrcode"
)

// ErrInvoicePDFQRPrerequisites means SaaS vendor / default account / RUB / ST00012 preconditions failed.
var ErrInvoicePDFQRPrerequisites = errors.New("cannot generate invoice PDF: payment QR prerequisites not met (SaaS operator default RUB bank account and valid ST00012 fields)")

type paymentAccountJSON struct {
	IsDefault            *bool   `json:"isDefault"`
	BankName             *string `json:"bankName"`
	BIC                  *string `json:"bic"`
	CorrespondentAccount *string `json:"correspondentAccount"`
	AccountNumber        *string `json:"accountNumber"`
}

type counterpartyJSON struct {
	FullName  *string `json:"fullName"`
	ShortName *string `json:"shortName"`
	Inn       *string `json:"inn"`
	Kpp       *string `json:"kpp"`
	Ogrn      *string `json:"ogrn"`
	Ogrnip    *string `json:"ogrnip"`
	Phone     *string `json:"phone"`
	Email     *string `json:"email"`
	Addresses *struct {
		Legal *struct {
			PostalCode   *string `json:"postalCode"`
			Unrestricted *string `json:"unrestricted"`
		} `json:"legal"`
	} `json:"addresses"`
}

func pickDefaultPaymentAccountJSON(raw json.RawMessage) *paymentAccountJSON {
	if len(raw) == 0 {
		return nil
	}
	var rows []paymentAccountJSON
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil
	}
	for i := range rows {
		if rows[i].IsDefault != nil && *rows[i].IsDefault {
			return &rows[i]
		}
	}
	return nil
}

func parseCounterparty(raw json.RawMessage) counterpartyJSON {
	var cp counterpartyJSON
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &cp)
	}
	return cp
}

func legalAddressLine(cp counterpartyJSON) string {
	if cp.Addresses == nil || cp.Addresses.Legal == nil {
		return ""
	}
	l := cp.Addresses.Legal
	parts := []string{}
	if l.PostalCode != nil && strings.TrimSpace(*l.PostalCode) != "" {
		parts = append(parts, strings.TrimSpace(*l.PostalCode))
	}
	if l.Unrestricted != nil && strings.TrimSpace(*l.Unrestricted) != "" {
		parts = append(parts, strings.TrimSpace(*l.Unrestricted))
	}
	return strings.Join(parts, ", ")
}

func payeeLegalName(vendor *models.Company, cp counterpartyJSON) string {
	if cp.FullName != nil {
		if s := strings.TrimSpace(*cp.FullName); s != "" {
			return s
		}
	}
	if cp.ShortName != nil {
		if s := strings.TrimSpace(*cp.ShortName); s != "" {
			return s
		}
	}
	return strings.TrimSpace(vendor.Name)
}

func supplierShortLegal(cp counterpartyJSON) string {
	if cp.ShortName != nil {
		if s := strings.TrimSpace(*cp.ShortName); s != "" {
			return s
		}
	}
	if cp.FullName != nil {
		if s := strings.TrimSpace(*cp.FullName); s != "" {
			return s
		}
	}
	return ""
}

func formatMinorForPDF(currency string, minor int64) string {
	cur := strings.TrimSpace(strings.ToUpper(currency))
	if cur == "" {
		cur = "RUB"
	}
	if cur == "RUB" {
		return FormatPriceMinorUnitsRU(minor)
	}
	div := int64(100)
	if cur == "JPY" {
		div = 1
	}
	whole := minor / div
	frac := minor % div
	if div == 1 {
		return fmt.Sprintf("%s %s", formatThousandsAbs(whole), cur)
	}
	return fmt.Sprintf("%s,%02d %s", formatThousandsAbs(whole), frac, cur)
}

func issueDateStr(inv *models.Invoice) string {
	var t interface {
		Format(string) string
	}
	if inv.IssuedAt != nil {
		t = *inv.IssuedAt
	} else {
		t = inv.CreatedAt
	}
	return t.Format("02.01.2006")
}

func dueDateStr(inv *models.Invoice) string {
	return inv.DueDate.Format("02.01.2006")
}

const (
	pdfMargin     = 36.0
	pdfPageW      = 595.0
	pdfPageH      = 841.0
	footerReserve = 120.0
)

func formatRUBAmountNoCurrencySymbol(amountMinor int64) string {
	if amountMinor < 0 {
		amountMinor = -amountMinor
	}
	s := strings.TrimSpace(FormatPriceMinorUnitsRU(amountMinor))
	s = strings.TrimSuffix(s, "₽")
	return strings.TrimSpace(s)
}

func itemsTotalAmountLineRU(lineCount int, amountMinor int64) string {
	n := int64(lineCount)
	if n < 0 {
		n = 0
	}
	w := pluralSlavic(n, "наименование", "наименования", "наименований")
	return fmt.Sprintf("Всего %d %s на сумму %s руб.", lineCount, w, formatRUBAmountNoCurrencySymbol(amountMinor))
}

func pdfStrokeRectGray(pdf *gopdf.GoPdf, x, y, w, h float64) {
	pdf.SetLineWidth(0.35)
	pdf.SetStrokeColor(170, 170, 170)
	pdf.RectFromUpperLeftWithStyle(x, y, w, h, "D")
	pdf.SetStrokeColor(0, 0, 0)
}

// BuildInvoicePDF renders A4 PDF with ST00012 QR and structured RU invoice layout.
func BuildInvoicePDF(inv *models.Invoice, vendor *models.Company) ([]byte, error) {
	if vendor == nil {
		return nil, ErrInvoicePDFQRPrerequisites
	}
	cur := strings.TrimSpace(strings.ToUpper(inv.Currency))
	if cur == "" {
		cur = "RUB"
	}
	if cur != "RUB" {
		return nil, ErrInvoicePDFQRPrerequisites
	}
	acct := pickDefaultPaymentAccountJSON(vendor.PaymentAccounts)
	if acct == nil {
		return nil, ErrInvoicePDFQRPrerequisites
	}
	vcp := parseCounterparty(vendor.Counterparty)
	inn := ""
	if vcp.Inn != nil {
		inn = strings.TrimSpace(*vcp.Inn)
	}
	kppOpt := ""
	if vcp.Kpp != nil {
		kppOpt = strings.TrimSpace(*vcp.Kpp)
	}
	purpose := RuBankPaymentPurposeFromInvoice(inv)
	qrIn := ruqr.Input{
		Name:                 payeeLegalName(vendor, vcp),
		PersonalAcc:          derefStr(acct.AccountNumber),
		BankName:             derefStr(acct.BankName),
		BIC:                  derefStr(acct.BIC),
		CorrespondentAccount: derefStr(acct.CorrespondentAccount),
		SumKopecks:           inv.Amount,
		Purpose:              purpose,
		PayeeINN:             inn,
		KPP:                  kppOpt,
	}
	payload, ok := ruqr.BuildPayload(qrIn)
	if !ok {
		return nil, ErrInvoicePDFQRPrerequisites
	}
	qrPNG, err := qrcode.Encode(payload, qrcode.Medium, 190)
	if err != nil {
		return nil, fmt.Errorf("qrcode: %w", err)
	}

	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{
		PageSize: *gopdf.PageSizeA4,
		Unit:     gopdf.UnitPT,
	})
	pdf.SetMargins(pdfMargin, pdfMargin, pdfMargin, pdfMargin)

	addInvoicePage := func() error {
		pdf.AddPage()
		return drawQuokkaWatermark(&pdf)
	}
	if err := addInvoicePage(); err != nil {
		return nil, err
	}

	if err := pdf.AddTTFFontData("dejavu", assets.DejaVuSansTTF); err != nil {
		return nil, err
	}
	if err := pdf.AddTTFFontData("dejavubd", assets.DejaVuSansBoldTTF); err != nil {
		return nil, err
	}

	setFont := func(size float64) {
		_ = pdf.SetFont("dejavu", "", size)
		pdf.SetTextColor(0, 0, 0)
	}

	setFontBold := func(size float64) {
		_ = pdf.SetFont("dejavubd", "", size)
		pdf.SetTextColor(0, 0, 0)
	}

	contentRight := pdfPageW - pdfMargin
	contentW := contentRight - pdfMargin
	left := pdfMargin
	var y float64
	lineH := 13.0

	qrHolder, err := gopdf.ImageHolderByBytes(qrPNG)
	if err != nil {
		return nil, err
	}

	docNo := "—"
	if inv.DocumentNumber != nil && strings.TrimSpace(*inv.DocumentNumber) != "" {
		docNo = strings.TrimSpace(*inv.DocumentNumber)
	}
	barPayload := invoiceBarcodeContent(docNo, inv.ID)

	// --- Шапка: логотип; «Счёт» + номер и даты справа; sepY без учёта штрих-кода; CODE-128 внизу слева (в конце страницы) ---
	y0 := pdfMargin
	logoH := 36.0
	logoW := (220.0 / 54.0) * logoH
	logoHolder, err := gopdf.ImageHolderByBytes(assets.LogoTextPNG)
	if err != nil {
		return nil, fmt.Errorf("logo: %w", err)
	}
	if err := pdf.ImageByHolder(logoHolder, left, y0, &gopdf.Rect{W: logoW, H: logoH}); err != nil {
		return nil, err
	}

	ry := y0

	setFont(22)
	tHead := "Счёт "
	wHead, _ := pdf.MeasureTextWidth(tHead)
	wNo, _ := pdf.MeasureTextWidth(docNo)
	xTitle := contentRight - (wHead + wNo + 1)
	pdf.SetXY(xTitle, ry)
	pdf.SetTextColor(0, 0, 0)
	_ = pdf.Cell(&gopdf.Rect{W: wHead + 1, H: 28}, tHead)
	pdf.SetTextColor(125, 125, 125)
	_ = pdf.Cell(&gopdf.Rect{W: wNo + 4, H: 28}, docNo)
	pdf.SetTextColor(0, 0, 0)

	setFont(9)
	pdf.SetTextColor(130, 130, 130)
	dateLine := fmt.Sprintf("Выставлен %s  →  Срок оплаты %s", issueDateStr(inv), dueDateStr(inv))
	rightEndY := pdfDrawWordWrapRight(&pdf, contentRight, ry+24, contentW, 10.5, dateLine)
	pdf.SetTextColor(0, 0, 0)

	sepY := math.Max(y0+logoH+2, rightEndY+3)
	pdf.SetLineWidth(0.35)
	pdf.SetStrokeColor(200, 200, 200)
	pdf.Line(left, sepY, contentRight, sepY)
	pdf.SetStrokeColor(0, 0, 0)

	y = sepY + 14

	// --- Реквизиты для оплаты + QR в одной строке ---
	if y+footerReserve+140 > pdfPageH-pdfMargin {
		if err := addInvoicePage(); err != nil {
			return nil, err
		}
		y = pdfMargin + 8
	}

	qrSize := 100.0
	gapQR := 12.0
	payBoxW := contentW - qrSize - gapQR
	payY0 := y
	pad := 8.0
	innerL := left + pad
	innerPayW := payBoxW - 2*pad

	payLineH := 10.5
	yBody := pdfDrawBoxHeader(&pdf, innerL, payY0+pad, innerPayW, "Реквизиты для оплаты", setFontBold)
	yText := pdfDrawLabelValueRows(&pdf, innerL, yBody, innerPayW, payLineH, paymentDetailPairs(acct), setFont, setFontBold)

	yText += 4
	setFontBold(9)
	pdf.SetXY(innerL, yText)
	_ = pdf.Cell(&gopdf.Rect{W: innerPayW, H: 11}, "Назначение платежа")
	yText += 13
	setFont(9)
	yText = pdfDrawWordWrapLeft(&pdf, innerL, yText, innerPayW, payLineH, purpose)

	payH := math.Max(yText-payY0+pad, qrSize+2*pad)
	qrY := payY0 + (payH-qrSize)/2
	if err := pdf.ImageByHolder(qrHolder, contentRight-qrSize, qrY, &gopdf.Rect{W: qrSize, H: qrSize}); err != nil {
		return nil, err
	}
	pdfStrokeRectGray(&pdf, left, payY0, payBoxW, payH)
	y = payY0 + payH + 14

	// --- Плательщик | Поставщик ---
	if y+footerReserve+100 > pdfPageH-pdfMargin {
		if err := addInvoicePage(); err != nil {
			return nil, err
		}
		y = pdfMargin + 8
	}

	colGap := 10.0
	colW := (contentW - colGap) / 2
	iw := colW - 16
	boxY0 := y
	il := left + 8
	ir := left + colW + colGap + 8

	boxLineH := 10.5
	yPayerBody := pdfDrawBoxHeader(&pdf, il, boxY0+pad, iw, "Плательщик", setFontBold)
	yl := pdfDrawLabelValueRows(&pdf, il, yPayerBody, iw, boxLineH, buyerLabelValuePairs(inv), setFont, setFontBold)
	leftEnd := yl + pad

	ySuppBody := pdfDrawBoxHeader(&pdf, ir, boxY0+pad, iw, "Поставщик", setFontBold)
	supPairs := legalEntityLabelValuePairs(vcp, vendor.Name)
	if len(supPairs) == 0 {
		supPairs = []pdfLabelValue{{"Наименование", strings.TrimSpace(vendor.Name)}}
	}
	yr := pdfDrawLabelValueRows(&pdf, ir, ySuppBody, iw, boxLineH, supPairs, setFont, setFontBold)
	rightEnd := yr + pad

	boxH := math.Max(math.Max(leftEnd, rightEnd)-boxY0, 44)
	pdfStrokeRectGray(&pdf, left, boxY0, colW, boxH)
	pdfStrokeRectGray(&pdf, left+colW+colGap, boxY0, colW, boxH)
	y = boxY0 + boxH + 14

	// --- Таблица ---
	pdf.SetLineWidth(0.35)
	pdf.Line(left, y, contentRight, y)
	y += 6

	// Gaps between columns + slightly wider weights for price/VAT headers (RU text).
	const tableColGutter = 5.0
	colWeights := []float64{11, 86, 20, 17, 52, 42, 48, 38, 46}
	nGaps := len(colWeights) - 1
	usableTableW := contentW - tableColGutter*float64(nGaps)
	var weightSum float64
	for _, w := range colWeights {
		weightSum += w
	}
	tableWidths := make([]float64, len(colWeights))
	var widthsAcc float64
	for i, w := range colWeights {
		tableWidths[i] = math.Round((w/weightSum)*usableTableW*10) / 10
		widthsAcc += tableWidths[i]
	}
	if drift := usableTableW - widthsAcc; math.Abs(drift) > 0.01 {
		tableWidths[len(tableWidths)-1] += drift
	}

	headerTexts := []string{"#", "Наименование", "Кол-во", "Ед.", "Цена с НДС", "Ставка НДС", "Сумма НДС", "Скидка", "Всего"}
	setFont(8)
	x := left
	for i, t := range headerTexts {
		cellW := tableWidths[i]
		tw, _ := pdf.MeasureTextWidth(t)
		if i >= 2 && i != 3 {
			xi := x + cellW - tw - 2
			if xi < x {
				xi = x
			}
			pdf.SetXY(xi, y)
			_ = pdf.Cell(&gopdf.Rect{W: tw + 2, H: 12}, t)
		} else {
			pdf.SetXY(x, y)
			_ = pdf.Cell(&gopdf.Rect{W: cellW, H: 12}, t)
		}
		x += cellW
		if i < nGaps {
			x += tableColGutter
		}
	}
	y += 14
	pdf.Line(left, y-2, contentRight, y-2)
	y += 4

	rowH := 14.0
	setFont(8)
	for i, line := range inv.Lines {
		if y+rowH+footerReserve > pdfPageH-pdfMargin {
			if err := addInvoicePage(); err != nil {
				return nil, err
			}
			y = pdfMargin + 8
			setFont(8)
		}
		x = left
		row := []string{
			fmt.Sprintf("%d", i+1),
			line.DescriptionPrint,
			trimQuantity(line.Quantity),
			strings.TrimSpace(line.MeasureUnit),
			formatMinorForPDF(inv.Currency, effectiveUnitPriceInclVatMinor(line)),
			vatRateLinePDF(line),
			vatAmountLinePDF(line, inv.Currency),
			discountLinePDF(line, inv.Currency),
			formatMinorForPDF(inv.Currency, line.LineGrossMinor),
		}
		for j, txt := range row {
			cellW := tableWidths[j]
			clip := txt
			if j == 1 && len([]rune(clip)) > 36 {
				r := []rune(clip)
				clip = string(r[:34]) + "…"
			}
			tw, _ := pdf.MeasureTextWidth(clip)
			if j >= 2 && j != 3 {
				xi := x + cellW - tw - 2
				if xi < x {
					xi = x
				}
				pdf.SetXY(xi, y)
				_ = pdf.Cell(&gopdf.Rect{W: tw + 2, H: rowH}, clip)
			} else {
				pdf.SetXY(x, y)
				_ = pdf.Cell(&gopdf.Rect{W: cellW, H: rowH}, clip)
			}
			x += cellW
			if j < nGaps {
				x += tableColGutter
			}
		}
		y += rowH + 3
	}

	y += 8
	pdf.SetLineWidth(0.45)
	pdf.Line(left, y, contentRight, y)
	y += 12

	summaryY := y

	totalDisc := pdfTotalDiscountMinor(inv.Lines)
	vatAdjRows := pdfVatAdjustmentRowsForInvoice(inv, inv.Currency)
	amtPay := formatMinorForPDF(inv.Currency, inv.Amount)
	subVal := formatMinorForPDF(inv.Currency, inv.SubtotalExclVatMinor)
	vatVal := formatMinorForPDF(inv.Currency, inv.VatTotalMinor)
	discVal := formatMinorForPDF(inv.Currency, totalDisc)

	wordsW := contentRight - left - 178
	if wordsW < 130 {
		wordsW = 130
	}

	sumLineH := 10.5
	yLeft := summaryY
	setFont(9)
	yLeft = pdfDrawWordWrapLeft(&pdf, left, yLeft, wordsW, sumLineH, itemsTotalAmountLineRU(len(inv.Lines), inv.Amount))
	yLeft += 2
	setFontBold(9)
	yLeft = pdfDrawWordWrapLeft(&pdf, left, yLeft, wordsW, sumLineH, AmountInWordsRUOnly(inv.Amount))
	setFont(9)

	yt := summaryY
	valueColW := 108.0
	totalsColGap := 14.0
	labelRightX := contentRight - valueColW - totalsColGap

	drawTotalsRow := func(label, value string, labelMuted bool) {
		setFont(9)
		if labelMuted {
			pdf.SetTextColor(115, 115, 115)
		} else {
			pdf.SetTextColor(0, 0, 0)
		}
		wl, _ := pdf.MeasureTextWidth(label)
		pdf.SetXY(labelRightX-wl, yt)
		_ = pdf.Cell(&gopdf.Rect{W: wl + 1, H: lineH}, label)
		setFont(9)
		pdf.SetTextColor(0, 0, 0)
		wv, _ := pdf.MeasureTextWidth(value)
		pdf.SetXY(contentRight-wv, yt)
		_ = pdf.Cell(&gopdf.Rect{W: wv + 1, H: lineH}, value)
		yt += lineH
	}

	pdf.SetTextColor(115, 115, 115)
	setFont(9)
	payHeading := "Всего к оплате:"
	wPayLbl, _ := pdf.MeasureTextWidth(payHeading)
	pdf.SetXY(contentRight-wPayLbl, yt)
	_ = pdf.Cell(&gopdf.Rect{W: wPayLbl + 1, H: 11}, payHeading)
	yt += 11
	setFontBold(15)
	wPay, _ := pdf.MeasureTextWidth(amtPay)
	pdf.SetXY(contentRight-wPay, yt)
	pdf.SetTextColor(0, 0, 0)
	_ = pdf.Cell(&gopdf.Rect{W: wPay + 1, H: 19}, amtPay)
	yt += 21
	setFont(9)

	if totalDisc > 0 {
		drawTotalsRow("Скидка", discVal, true)
	}
	pdf.SetTextColor(115, 115, 115)
	for _, ar := range vatAdjRows {
		drawTotalsRow(ar.label, ar.value, true)
	}
	pdf.SetTextColor(0, 0, 0)
	yt += 5
	pdf.SetLineWidth(0.3)
	pdf.SetStrokeColor(210, 210, 210)
	sepLeft := labelRightX - valueColW
	if sepLeft < left+wordsW+8 {
		sepLeft = left + wordsW + 8
	}
	pdf.Line(sepLeft, yt, contentRight, yt)
	pdf.SetStrokeColor(0, 0, 0)
	yt += 8

	drawTotalsRow("Итого без НДС", subVal, true)
	drawTotalsRow("НДС", vatVal, true)

	yRight := yt

	y = math.Max(yLeft, yRight) + 16

	if y+footerReserve > pdfPageH-pdfMargin {
		if err := addInvoicePage(); err != nil {
			return nil, err
		}
		y = pdfMargin + 8
	}

	// --- Условия оплаты (пока без текста) ---
	condH := 52.0
	condY := y
	pdfStrokeRectGray(&pdf, left, condY, contentW, condH)
	setFont(10)
	pdf.SetXY(left+pad, condY+pad)
	_ = pdf.Cell(&gopdf.Rect{W: contentW - 2*pad, H: 12}, "Условия оплаты")
	y = condY + condH + 16

	if y+footerReserve > pdfPageH-pdfMargin {
		if err := addInvoicePage(); err != nil {
			return nil, err
		}
		y = pdfMargin + 8
	}

	// --- Подпись руководителя и м.п. ---
	sigY := y
	sq := 48.0
	sqX := contentRight - sq - pad
	sqY := sigY + 6

	setFont(9)
	pdf.SetXY(left, sigY)
	_ = pdf.Cell(&gopdf.Rect{W: 200, H: 12}, "Руководитель")

	lineY := sigY + 26.0
	pdf.SetLineWidth(0.35)
	pdf.SetStrokeColor(0, 0, 0)
	pdf.Line(left, lineY, left+170, lineY)

	setFont(8)
	pdf.SetTextColor(115, 115, 115)
	pdf.SetXY(left, lineY+3)
	_ = pdf.Cell(&gopdf.Rect{W: 200, H: 10}, "(подпись)")
	pdf.SetTextColor(0, 0, 0)

	pdf.SetLineType("dashed")
	pdf.SetLineWidth(0.45)
	pdf.SetStrokeColor(150, 150, 150)
	pdf.RectFromUpperLeftWithStyle(sqX, sqY, sq, sq, "D")
	pdf.SetLineType("solid")
	pdf.SetStrokeColor(0, 0, 0)

	setFont(9)
	mp := "м.п."
	twMP, _ := pdf.MeasureTextWidth(mp)
	pdf.SetXY(sqX+(sq-twMP)/2, sqY+sq/2-5)
	_ = pdf.Cell(&gopdf.Rect{W: twMP + 4, H: 12}, mp)

	y = math.Max(lineY+16, sqY+sq) + 20

	if y+32 > pdfPageH-pdfMargin {
		if err := addInvoicePage(); err != nil {
			return nil, err
		}
		y = pdfMargin + 8
	}

	// --- Сердце внизу ---
	centerX := pdfPageW / 2
	setFont(20)
	pdf.SetTextColor(220, 38, 38)
	twHeart, _ := pdf.MeasureTextWidth("♥")
	pdf.SetXY(centerX-twHeart/2, y)
	_ = pdf.Cell(&gopdf.Rect{W: twHeart + 4, H: 22}, "♥")
	pdf.SetTextColor(0, 0, 0)

	barW := 168.0
	barH := 18.0
	barCornerX := left + 4
	barCornerY := pdfPageH - pdfMargin - barH - 6
	if barPNG, berr := encodeCode128PNG(barPayload, int(math.Max(barW*5, 520)), 40); berr == nil {
		if barHold, herr := gopdf.ImageHolderByBytes(barPNG); herr == nil {
			_ = pdf.ImageByHolder(barHold, barCornerX, barCornerY, &gopdf.Rect{W: barW, H: barH})
		}
	}

	return pdf.GetBytesPdfReturnErr()
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func trimQuantity(q float64) string {
	if math.Abs(q-math.Round(q)) < 1e-6 {
		return fmt.Sprintf("%.0f", q)
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.4f", q), "0"), ".")
}

func effectiveUnitPriceInclVatMinor(line models.InvoiceLine) int64 {
	if line.Quantity <= 0 || math.IsNaN(line.Quantity) || math.IsInf(line.Quantity, 0) {
		return 0
	}
	return int64(math.Round(float64(line.LineGrossMinor) / line.Quantity))
}

func lineDiscountMinor(line models.InvoiceLine) int64 {
	before := int64(math.Round(float64(line.UnitPriceInclVatMinor) * line.Quantity))
	if before < line.LineGrossMinor {
		return 0
	}
	return before - line.LineGrossMinor
}

func pdfTotalDiscountMinor(lines []models.InvoiceLine) int64 {
	var s int64
	for i := range lines {
		s += lineDiscountMinor(lines[i])
	}
	return s
}

type pdfVatAdjRow struct {
	label string
	value string
}

func pdfVatAdjustmentRowsForInvoice(inv *models.Invoice, currency string) []pdfVatAdjRow {
	lines := inv.Lines
	vatByRate := map[float64]int64{}
	anyExempt := false
	for i := range lines {
		ln := lines[i]
		if ln.VatExempt {
			anyExempt = true
		} else {
			vatByRate[ln.VatRatePercent] += ln.VatAmountMinor
		}
	}
	rates := make([]float64, 0, len(vatByRate))
	for r := range vatByRate {
		rates = append(rates, r)
	}
	sort.Float64s(rates)
	var rows []pdfVatAdjRow
	if anyExempt {
		rows = append(rows, pdfVatAdjRow{"Без НДС", "—"})
	}
	for _, r := range rates {
		lbl := vatRateLinePDF(models.InvoiceLine{VatRatePercent: r})
		rows = append(rows, pdfVatAdjRow{lbl, formatMinorForPDF(currency, vatByRate[r])})
	}
	return rows
}

func vatRateLinePDF(line models.InvoiceLine) string {
	if line.VatExempt {
		return "Без НДС"
	}
	r := line.VatRatePercent
	if r == float64(int64(r)) {
		return fmt.Sprintf("%.0f%%", r)
	}
	s := strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.4f", r), "0"), ".")
	return s + "%"
}

func vatAmountLinePDF(line models.InvoiceLine, currency string) string {
	if line.VatExempt {
		return "—"
	}
	return formatMinorForPDF(currency, line.VatAmountMinor)
}

func discountLinePDF(line models.InvoiceLine, currency string) string {
	d := lineDiscountMinor(line)
	if d == 0 {
		return "—"
	}
	return formatMinorForPDF(currency, d)
}
