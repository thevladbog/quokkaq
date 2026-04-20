package services

import (
	"fmt"
	"strings"

	"github.com/signintech/gopdf"
)

// pdfStampFooterBarcodeEveryPage draws the same CODE-128 image at the bottom-left of
// every page (after layout). Call after pdfStampInvoiceMultipageHeadersFooters so
// multipage footers are already in place.
func pdfStampFooterBarcodeEveryPage(
	pdf *gopdf.GoPdf,
	totalPages int,
	left, topMargin, pageHeight float64,
	barHold gopdf.ImageHolder,
	barW, barH float64,
) error {
	if barHold == nil || totalPages < 1 {
		return nil
	}
	barCornerX := left + 4
	barCornerY := pageHeight - topMargin - barH - 6
	for p := 1; p <= totalPages; p++ {
		if err := pdf.SetPage(p); err != nil {
			return err
		}
		if err := pdf.ImageByHolder(barHold, barCornerX, barCornerY, &gopdf.Rect{W: barW, H: barH}); err != nil {
			return err
		}
	}
	return pdf.SetPage(totalPages)
}

// invoiceContinuationHeaderInset is vertical space reserved below the page top when continuing
// on page 2+ so body text does not overlap the stamped continuation header + rule.
const invoiceContinuationHeaderInset = 38.0

const invoiceContHeaderFontPt = 8.5
const invoicePageFooterFontPt = 8.0

// pdfContinuationBodyTopPad returns extra Y offset after a new page when the document has
// a continuation header band (page 2+).
func pdfContinuationBodyTopPad(pdf *gopdf.GoPdf) float64 {
	if pdf.GetNumberOfPages() >= 2 {
		return invoiceContinuationHeaderInset
	}
	return 0
}

// pdfStampInvoiceMultipageHeadersFooters draws continuation header (page 2+) and
// "n стр. из m" bottom-right on every page when m > 1. Call after all layout, before GetBytesPdf.
func pdfStampInvoiceMultipageHeadersFooters(
	pdf *gopdf.GoPdf,
	totalPages int,
	docNo string,
	issueDate string,
	left, contentRight float64,
	topMargin, pageHeight float64,
	setFontItalic func(float64),
	setFontNeutral func(float64),
) error {
	if totalPages < 2 {
		return nil
	}
	docNo = strings.TrimSpace(docNo)
	if docNo == "" {
		docNo = "—"
	}
	issueDate = strings.TrimSpace(issueDate)
	contText := fmt.Sprintf("Продолжение документа Счет на оплату № %s от %s", docNo, issueDate)
	textW := contentRight - left
	headerY0 := topMargin + 4.0
	lineStep := invoiceContHeaderFontPt + 1.4

	for p := 1; p <= totalPages; p++ {
		if err := pdf.SetPage(p); err != nil {
			return err
		}

		setFontNeutral(invoicePageFooterFontPt)
		pdf.SetTextColor(95, 95, 95)
		footerStr := fmt.Sprintf("%d стр. из %d", p, totalPages)
		fw, _ := pdf.MeasureTextWidth(footerStr)
		fy := pageHeight - topMargin - 12.0
		pdf.SetXY(contentRight-fw, fy)
		_ = pdf.Cell(&gopdf.Rect{W: fw + 2, H: invoicePageFooterFontPt + 2}, footerStr)

		if p >= 2 {
			setFontItalic(invoiceContHeaderFontPt)
			pdf.SetTextColor(55, 55, 55)
			hy := headerY0
			for _, ln := range pdfWordWrapLines(pdf, contText, textW) {
				pdf.SetXY(left, hy)
				_ = pdf.Cell(&gopdf.Rect{W: textW, H: invoiceContHeaderFontPt + 2}, ln)
				hy += lineStep
			}
			ruleY := hy + 2.0
			pdf.SetLineWidth(0.35)
			pdf.SetStrokeColor(170, 170, 170)
			pdf.Line(left, ruleY, contentRight, ruleY)
			pdf.SetStrokeColor(0, 0, 0)
		}

		setFontNeutral(9)
		pdf.SetTextColor(0, 0, 0)
	}

	return pdf.SetPage(totalPages)
}
