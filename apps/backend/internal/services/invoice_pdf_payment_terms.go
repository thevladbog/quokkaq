package services

import (
	"regexp"
	"strings"

	"github.com/signintech/gopdf"
)

// invoicePaymentTermsBottomClearance is space reserved above the bottom margin for the
// footer barcode band and the page-number line. It is smaller than footerReserve: the
// signature and «♥» blocks are laid out after this section and use their own page breaks.
const invoicePaymentTermsBottomClearance = 46.0

var (
	reFence       = regexp.MustCompile("(?s)```[^`]*```")
	reLink        = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	reHeadingLine = regexp.MustCompile(`^#{1,6}\s+`)
	reListLine    = regexp.MustCompile(`^(\s*)([-*+]|\d+\.)\s+`)
)

// invoiceMarkdownToPlainForPDF strips common markdown for a readable printed invoice (no HTML).
func invoiceMarkdownToPlainForPDF(src string) string {
	s := strings.TrimSpace(src)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = reFence.ReplaceAllString(s, "\n\n")
	s = reLink.ReplaceAllString(s, "$1")
	var b strings.Builder
	for _, line := range strings.Split(s, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			b.WriteByte('\n')
			continue
		}
		t = reHeadingLine.ReplaceAllString(t, "")
		t = reListLine.ReplaceAllString(t, "")
		t = stripInlineEmphasis(t)
		b.WriteString(t)
		b.WriteByte('\n')
	}
	out := strings.TrimSpace(b.String())
	out = regexp.MustCompile(`\n{3,}`).ReplaceAllString(out, "\n\n")
	out = strings.ReplaceAll(out, "**", "")
	out = strings.ReplaceAll(out, "__", "")
	return strings.TrimSpace(out)
}

func stripInlineEmphasis(s string) string {
	for range 200 {
		n := len(s)
		s = stripOneEmphasisPass(s)
		if len(s) == n {
			break
		}
	}
	return s
}

func stripOneEmphasisPass(s string) string {
	for _, sep := range []string{"**", "__", "*", "_"} {
		i := strings.Index(s, sep)
		if i < 0 {
			continue
		}
		j := strings.Index(s[i+len(sep):], sep)
		if j < 0 {
			continue
		}
		j += i + len(sep)
		return s[:i] + s[i+len(sep):j] + s[j+len(sep):]
	}
	return s
}

// pdfDrawInvoicePaymentTermsSection draws «Условия оплаты»; may use multiple pages/chunks when text is long.
func pdfDrawInvoicePaymentTermsSection(
	pdf *gopdf.GoPdf,
	left, y, contentW, pad float64,
	addInvoicePage func() error,
	setFont, setFontBold func(float64),
	termsMarkdown string,
) (float64, error) {
	plain := invoiceMarkdownToPlainForPDF(termsMarkdown)
	textW := contentW - 2*pad
	lineH := 10.5
	lineGap := 1.2
	firstTitleBlock := 18.0 // «Условия оплаты» + отступ
	contTitleBlock := 12.0  // «… (продолжение)»
	minChunkH := 44.0

	paras := []string{}
	for _, p := range strings.Split(plain, "\n\n") {
		p = strings.TrimSpace(p)
		if p != "" {
			paras = append(paras, p)
		}
	}
	if len(paras) == 0 {
		condH := minChunkH
		if y+condH > paymentTermsMaxContentY() {
			if err := addInvoicePage(); err != nil {
				return y, err
			}
			y = pdfMargin + 8 + pdfContinuationBodyTopPad(pdf)
		}
		pdfStrokeRectGray(pdf, left, y, contentW, condH)
		setFontBold(10)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetXY(left+pad, y+pad)
		_ = pdf.Cell(&gopdf.Rect{W: textW, H: 12}, "Условия оплаты")
		return y + condH + 16, nil
	}

	type lineSeg struct {
		text    string
		paraGap bool
	}
	var segs []lineSeg
	for pi, p := range paras {
		for _, ln := range pdfWordWrapLines(pdf, p, textW) {
			segs = append(segs, lineSeg{text: ln, paraGap: false})
		}
		if pi < len(paras)-1 {
			segs = append(segs, lineSeg{paraGap: true})
		}
	}

	chunkIdx := 0
	for len(segs) > 0 {
		for y+minChunkH > paymentTermsMaxContentY() {
			if err := addInvoicePage(); err != nil {
				return y, err
			}
			y = pdfMargin + 8 + pdfContinuationBodyTopPad(pdf)
		}

		titleBlock := firstTitleBlock
		if chunkIdx > 0 {
			titleBlock = contTitleBlock
		}
		avail := paymentTermsMaxContentY() - y - 2*pad - titleBlock
		if avail < lineH*2 {
			if err := addInvoicePage(); err != nil {
				return y, err
			}
			y = pdfMargin + 8 + pdfContinuationBodyTopPad(pdf)
			avail = paymentTermsMaxContentY() - y - 2*pad - titleBlock
		}

		take := 0
		used := 0.0
		for take < len(segs) && used+lineH+lineGap <= avail+0.01 {
			if segs[take].paraGap {
				used += 6.0
				take++
				continue
			}
			used += lineH + lineGap
			take++
		}
		if take == 0 {
			take = 1
			for take < len(segs) && segs[take-1].paraGap {
				take++
			}
		}

		chunk := segs[:take]
		segs = segs[take:]

		bodyH := 0.0
		for _, seg := range chunk {
			if seg.paraGap {
				bodyH += 6.0
				continue
			}
			bodyH += lineH + lineGap
		}
		boxH := pad + titleBlock + bodyH + pad
		if boxH < minChunkH {
			boxH = minChunkH
		}

		pdfStrokeRectGray(pdf, left, y, contentW, boxH)
		ty := y + pad
		if chunkIdx == 0 {
			setFontBold(10)
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(left+pad, ty)
			_ = pdf.Cell(&gopdf.Rect{W: textW, H: 12}, "Условия оплаты")
			ty += firstTitleBlock
		} else {
			setFontBold(9)
			pdf.SetTextColor(90, 90, 90)
			pdf.SetXY(left+pad, ty)
			_ = pdf.Cell(&gopdf.Rect{W: textW, H: 10}, "Условия оплаты (продолжение)")
			ty += contTitleBlock
		}

		setFont(9)
		pdf.SetTextColor(0, 0, 0)
		for _, seg := range chunk {
			if seg.paraGap {
				ty += 6.0
				continue
			}
			pdf.SetXY(left+pad, ty)
			_ = pdf.Cell(&gopdf.Rect{W: textW, H: lineH}, seg.text)
			ty += lineH + lineGap
		}

		y += boxH + 12
		chunkIdx++
	}

	return y, nil
}

func paymentTermsMaxContentY() float64 {
	return pdfPageH - pdfMargin - invoicePaymentTermsBottomClearance
}
