package services

import (
	"strings"

	"github.com/signintech/gopdf"
)

// pdfWordWrapLines splits text into lines that fit maxWidth (pt) without breaking words;
// only spaces separate tokens (strings.Fields). Overlong single words stay on one line.
func pdfWordWrapLines(pdf *gopdf.GoPdf, text string, maxWidth float64) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			lines = append(lines, strings.TrimSpace(b.String()))
			b.Reset()
		}
	}
	for _, w := range words {
		wW, _ := pdf.MeasureTextWidth(w)
		if wW > maxWidth {
			flush()
			lines = append(lines, w)
			continue
		}
		trial := w
		if b.Len() > 0 {
			trial = b.String() + " " + w
		}
		tw, _ := pdf.MeasureTextWidth(trial)
		if b.Len() > 0 && tw > maxWidth {
			flush()
			b.WriteString(w)
			continue
		}
		if b.Len() > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(w)
	}
	flush()
	return lines
}

func pdfDrawWordWrapLeft(pdf *gopdf.GoPdf, x, y, maxW, lineH float64, text string) float64 {
	for _, ln := range pdfWordWrapLines(pdf, text, maxW) {
		pdf.SetXY(x, y)
		_ = pdf.Cell(&gopdf.Rect{W: maxW, H: lineH}, ln)
		y += lineH + 1.2
	}
	return y
}

func pdfDrawWordWrapRight(pdf *gopdf.GoPdf, contentRight, y, maxW, lineH float64, text string) float64 {
	for _, ln := range pdfWordWrapLines(pdf, text, maxW) {
		w, _ := pdf.MeasureTextWidth(ln)
		pdf.SetXY(contentRight-w, y)
		_ = pdf.Cell(&gopdf.Rect{W: w + 2, H: lineH}, ln)
		y += lineH + 1.2
	}
	return y
}
