package services

import (
	"strings"

	"quokkaq-go-backend/internal/models"

	"github.com/signintech/gopdf"
)

type pdfLabelValue struct {
	Label string
	Value string
}

func paymentDetailPairs(acct *paymentAccountJSON) []pdfLabelValue {
	if acct == nil {
		return nil
	}
	var pairs []pdfLabelValue
	if derefStr(acct.BankName) != "" {
		pairs = append(pairs, pdfLabelValue{"Банк", derefStr(acct.BankName)})
	}
	if derefStr(acct.BIC) != "" {
		pairs = append(pairs, pdfLabelValue{"БИК", derefStr(acct.BIC)})
	}
	if derefStr(acct.AccountNumber) != "" {
		pairs = append(pairs, pdfLabelValue{"Расчётный счёт (р/с)", derefStr(acct.AccountNumber)})
	}
	if derefStr(acct.CorrespondentAccount) != "" {
		pairs = append(pairs, pdfLabelValue{"Корр. счёт (к/с)", derefStr(acct.CorrespondentAccount)})
	}
	return pairs
}

func legalEntityLabelValuePairs(cp counterpartyJSON, fallbackName string) []pdfLabelValue {
	name := supplierShortLegal(cp)
	if name == "" && cp.FullName != nil {
		name = strings.TrimSpace(*cp.FullName)
	}
	if name == "" {
		name = strings.TrimSpace(fallbackName)
	}
	var pairs []pdfLabelValue
	if name != "" {
		pairs = append(pairs, pdfLabelValue{"Наименование", name})
	}
	if cp.Inn != nil && strings.TrimSpace(*cp.Inn) != "" {
		pairs = append(pairs, pdfLabelValue{"ИНН", strings.TrimSpace(*cp.Inn)})
	}
	if cp.Kpp != nil && strings.TrimSpace(*cp.Kpp) != "" {
		pairs = append(pairs, pdfLabelValue{"КПП", strings.TrimSpace(*cp.Kpp)})
	}
	if cp.Ogrnip != nil && strings.TrimSpace(*cp.Ogrnip) != "" {
		pairs = append(pairs, pdfLabelValue{"ОГРНИП", strings.TrimSpace(*cp.Ogrnip)})
	} else if cp.Ogrn != nil && strings.TrimSpace(*cp.Ogrn) != "" {
		pairs = append(pairs, pdfLabelValue{"ОГРН", strings.TrimSpace(*cp.Ogrn)})
	}
	if a := legalAddressLine(cp); a != "" {
		pairs = append(pairs, pdfLabelValue{"Юр. адрес", a})
	}
	if cp.Phone != nil && strings.TrimSpace(*cp.Phone) != "" {
		pairs = append(pairs, pdfLabelValue{"Тел.", strings.TrimSpace(*cp.Phone)})
	}
	if cp.Email != nil && strings.TrimSpace(*cp.Email) != "" {
		pairs = append(pairs, pdfLabelValue{"E-mail", strings.TrimSpace(*cp.Email)})
	}
	if len(pairs) == 0 {
		return nil
	}
	return pairs
}

func buyerLabelValuePairs(inv *models.Invoice) []pdfLabelValue {
	if len(inv.BuyerSnapshot) > 0 {
		cp := parseCounterparty(inv.BuyerSnapshot)
		p := legalEntityLabelValuePairs(cp, "")
		if len(p) > 0 {
			return p
		}
	}
	if inv.CompanyID != nil {
		cp := parseCounterparty(inv.Company.Counterparty)
		p := legalEntityLabelValuePairs(cp, strings.TrimSpace(inv.Company.Name))
		if len(p) > 0 {
			return p
		}
	}
	return []pdfLabelValue{{"Наименование", "—"}}
}

func pdfMaxLabelColumnWidth(pdf *gopdf.GoPdf, labels []string, setFontBold func(float64)) float64 {
	setFontBold(9)
	maxW := 0.0
	for _, L := range labels {
		w, _ := pdf.MeasureTextWidth(L)
		if w > maxW {
			maxW = w
		}
	}
	return maxW + 8
}

// pdfDrawBoxHeader draws UPPERCASE bold title and a thin full-width rule; returns Y to start body.
func pdfDrawBoxHeader(pdf *gopdf.GoPdf, innerL, y, innerW float64, title string, setFontBold func(float64)) float64 {
	title = strings.TrimSpace(title)
	if title == "" {
		return y
	}
	titleH := 12.0
	setFontBold(10)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(innerL, y)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: titleH}, strings.ToUpper(title))
	yLine := y + titleH + 1
	pdf.SetLineWidth(0.3)
	pdf.SetStrokeColor(190, 190, 190)
	pdf.Line(innerL, yLine, innerL+innerW, yLine)
	pdf.SetStrokeColor(0, 0, 0)
	return yLine + 5
}

// pdfDrawLabelValueRows draws label (bold) | value rows; values wrap by words in the right column.
func pdfDrawLabelValueRows(
	pdf *gopdf.GoPdf,
	innerL, y, innerW, lineH float64,
	pairs []pdfLabelValue,
	setFont, setFontBold func(float64),
) float64 {
	if len(pairs) == 0 {
		return y
	}
	labels := make([]string, len(pairs))
	for i, p := range pairs {
		labels[i] = p.Label
	}
	labelW := pdfMaxLabelColumnWidth(pdf, labels, setFontBold)
	maxLabel := innerW * 0.45
	if labelW > maxLabel {
		labelW = maxLabel
	}
	valGap := 6.0
	valX := innerL + labelW + valGap
	valW := innerW - labelW - valGap
	if valW < 40 {
		valW = 40
	}
	for _, p := range pairs {
		rowTop := y
		setFontBold(9)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetXY(innerL, rowTop)
		_ = pdf.Cell(&gopdf.Rect{W: labelW, H: lineH}, p.Label)
		setFont(9)
		lines := pdfWordWrapLines(pdf, p.Value, valW)
		if len(lines) == 0 {
			y = rowTop + lineH + 2
			continue
		}
		for i, ln := range lines {
			pdf.SetXY(valX, rowTop+float64(i)*(lineH+1.2))
			_ = pdf.Cell(&gopdf.Rect{W: valW, H: lineH}, ln)
		}
		n := len(lines)
		y = rowTop + float64(n)*(lineH+1.2) + 2
	}
	return y
}
