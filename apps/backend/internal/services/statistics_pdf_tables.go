package services

import (
	"github.com/signintech/gopdf"
)

type pdfColAlign int

const (
	pdfAlignLeft  pdfColAlign = 0
	pdfAlignRight pdfColAlign = 1
)

type pdfColumnDef struct {
	Header string
	Weight float64
	Align  pdfColAlign
}

type pdfTableConfig struct {
	HeaderFontPt float64
	BodyFontPt   float64
	RowHeight    float64
	ColGutter    float64
	ZebraR       uint8
	ZebraG       uint8
	ZebraB       uint8
	HeaderBgR    uint8
	HeaderBgG    uint8
	HeaderBgB    uint8
}

func defaultTableConfig() pdfTableConfig {
	return pdfTableConfig{
		HeaderFontPt: 8.0,
		BodyFontPt:   8.0,
		RowHeight:    14.0,
		ColGutter:    4.0,
		ZebraR:       245, ZebraG: 245, ZebraB: 248,
		HeaderBgR: 230, HeaderBgG: 232, HeaderBgB: 237,
	}
}

func computeColumnWidths(cols []pdfColumnDef, totalWidth, gutter float64) []float64 {
	n := len(cols)
	if n == 0 {
		return nil
	}
	totalGutter := gutter * float64(n-1)
	usable := totalWidth - totalGutter
	if usable < 0 {
		usable = 0
	}
	totalWeight := 0.0
	for _, c := range cols {
		totalWeight += c.Weight
	}
	if totalWeight <= 0 {
		totalWeight = 1
	}
	widths := make([]float64, n)
	assigned := 0.0
	for i := 0; i < n-1; i++ {
		w := usable * cols[i].Weight / totalWeight
		widths[i] = w
		assigned += w
	}
	widths[n-1] = usable - assigned
	return widths
}

// statsPdfDrawTable draws a table and returns the Y position after the table.
// addPage is called when a page break is needed; it must add a new page and return the Y to start drawing.
func statsPdfDrawTable(
	pdf *gopdf.GoPdf,
	x, y, tableWidth float64,
	cols []pdfColumnDef,
	rows [][]string,
	cfg pdfTableConfig,
	addPage func() (float64, error),
) (float64, error) {
	if len(cols) == 0 || len(rows) == 0 {
		return y, nil
	}
	colWidths := computeColumnWidths(cols, tableWidth, cfg.ColGutter)

	drawCell := func(cellX, cellY, cellW, cellH float64, text string, align pdfColAlign) {
		if align == pdfAlignRight {
			tw, _ := pdf.MeasureTextWidth(text)
			pdf.SetXY(cellX+cellW-tw, cellY)
		} else {
			pdf.SetXY(cellX, cellY)
		}
		_ = pdf.Cell(&gopdf.Rect{W: cellW, H: cellH}, text)
	}

	// Header row
	pdf.SetFillColor(cfg.HeaderBgR, cfg.HeaderBgG, cfg.HeaderBgB)
	pdf.RectFromUpperLeftWithStyle(x, y, tableWidth, cfg.RowHeight, "F")
	_ = pdf.SetFont("dejavubd", "", cfg.HeaderFontPt)
	pdf.SetTextColor(30, 30, 30)

	cx := x
	for i, col := range cols {
		drawCell(cx, y+2, colWidths[i], cfg.RowHeight-2, col.Header, col.Align)
		cx += colWidths[i] + cfg.ColGutter
	}
	y += cfg.RowHeight

	pdf.SetLineWidth(0.3)
	pdf.SetStrokeColor(200, 200, 200)
	pdf.Line(x, y, x+tableWidth, y)
	pdf.SetStrokeColor(0, 0, 0)
	y += 1

	// Body rows
	_ = pdf.SetFont("dejavu", "", cfg.BodyFontPt)
	for rowIdx, row := range rows {
		if y+cfg.RowHeight > pdfPageH-statsPdfFooterReserve {
			newY, err := addPage()
			if err != nil {
				return y, err
			}
			y = newY
			_ = pdf.SetFont("dejavu", "", cfg.BodyFontPt)
		}

		if rowIdx%2 == 1 {
			pdf.SetFillColor(cfg.ZebraR, cfg.ZebraG, cfg.ZebraB)
			pdf.RectFromUpperLeftWithStyle(x, y, tableWidth, cfg.RowHeight, "F")
		}

		pdf.SetTextColor(0, 0, 0)
		cx = x
		for i := range cols {
			val := ""
			if i < len(row) {
				val = row[i]
			}
			drawCell(cx, y+2, colWidths[i], cfg.RowHeight-2, val, cols[i].Align)
			cx += colWidths[i] + cfg.ColGutter
		}
		y += cfg.RowHeight
	}

	return y, nil
}
