package services

import (
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/assets"

	"github.com/signintech/gopdf"
)

// StatisticsPDFInput bundles all data sections for the PDF export.
type StatisticsPDFInput struct {
	UnitName       string
	DateFrom       string
	DateTo         string
	FilterZone     string
	FilterOperator string
	Labels         StatsPDFLabels

	SlaSummary    *SlaSummaryResponse
	Timeseries    *TimeseriesResponse
	Load          *LoadResponse
	SLADeviations *SLADeviationsResponse
	TicketsSvc    *TicketsByServiceResponse
	SurveyScores  *SurveyScoresResponse
	Utilization   *UtilizationResponse
	EmployeeRadar *EmployeeRadarResponse
}

const (
	statsPdfMargin        = 36.0
	statsPdfFooterReserve = 50.0
	statsPdfHeaderBandH   = 80.0
	statsPdfSectionGap    = 14.0
	statsPdfContinuationY = 28.0
)

// BuildStatisticsPDF generates a multi-page A4 PDF report for the given statistics data.
func BuildStatisticsPDF(input StatisticsPDFInput) ([]byte, error) {
	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{
		PageSize: *gopdf.PageSizeA4,
		Unit:     gopdf.UnitPT,
	})
	pdf.SetMargins(statsPdfMargin, statsPdfMargin, statsPdfMargin, statsPdfMargin)

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

	addPage := func() (float64, error) {
		pdf.AddPage()
		if err := drawQuokkaWatermark(&pdf); err != nil {
			return 0, err
		}
		return statsPdfMargin + statsPdfContinuationY, nil
	}

	y, err := addPage()
	if err != nil {
		return nil, err
	}

	left := statsPdfMargin
	contentRight := pdfPageW - statsPdfMargin
	innerW := contentRight - left
	tblCfg := defaultTableConfig()
	l := input.Labels

	// ── Title header ────────────────────────────────────────────────
	y = drawStatsReportHeader(&pdf, left, y, innerW, input)

	// ── SLA Summary (highlighted card) ──────────────────────────────
	if input.SlaSummary != nil && (input.SlaSummary.SlaWaitTotal > 0 || input.SlaSummary.SlaServiceTotal > 0) {
		y = drawStatsSLASummaryCard(&pdf, left, y, innerW, input.SlaSummary, l)
		y += statsPdfSectionGap
	}

	// ── Wait & Service Time (Timeseries) ────────────────────────────
	if input.Timeseries != nil && len(input.Timeseries.Points) > 0 {
		y, err = drawStatsSectionTimeseries(&pdf, left, y, innerW, input.Timeseries, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Ticket Volume (Load) ────────────────────────────────────────
	if input.Load != nil && len(input.Load.Points) > 0 {
		y, err = drawStatsSectionLoad(&pdf, left, y, innerW, input.Load, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── SLA Deviations ──────────────────────────────────────────────
	if input.SLADeviations != nil && len(input.SLADeviations.Points) > 0 {
		y, err = drawStatsSectionSLADeviations(&pdf, left, y, innerW, input.SLADeviations, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Tickets by Service ──────────────────────────────────────────
	if input.TicketsSvc != nil && len(input.TicketsSvc.Items) > 0 {
		y, err = drawStatsSectionTicketsByService(&pdf, left, y, innerW, input.TicketsSvc, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Survey Scores ───────────────────────────────────────────────
	if input.SurveyScores != nil && len(input.SurveyScores.Points) > 0 {
		y, err = drawStatsSectionSurvey(&pdf, left, y, innerW, input.SurveyScores, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Utilization ─────────────────────────────────────────────────
	if input.Utilization != nil && len(input.Utilization.Points) > 0 {
		y, err = drawStatsSectionUtilization(&pdf, left, y, innerW, input.Utilization, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Employee Radar ──────────────────────────────────────────────
	if input.EmployeeRadar != nil && input.EmployeeRadar.UserID != "" {
		y, err = drawStatsSectionRadar(&pdf, left, y, innerW, input.EmployeeRadar, tblCfg, addPage, l)
		if err != nil {
			return nil, err
		}
		_ = y
	}

	// ── Stamp page numbers ──────────────────────────────────────────
	nPages := pdf.GetNumberOfPages()
	setFont(8)
	for p := 1; p <= nPages; p++ {
		if err := pdf.SetPage(p); err != nil {
			return nil, err
		}
		setFont(8)
		pdf.SetTextColor(120, 120, 120)
		label := fmt.Sprintf("%d / %d", p, nPages)
		w, _ := pdf.MeasureTextWidth(label)
		fy := pdfPageH - statsPdfMargin + 10
		pdf.SetXY(contentRight-w, fy)
		_ = pdf.Cell(&gopdf.Rect{W: w + 2, H: 10}, label)
	}

	return pdf.GetBytesPdfReturnErr()
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsReportHeader(pdf *gopdf.GoPdf, left, y, innerW float64, input StatisticsPDFInput) float64 {
	l := input.Labels

	logoW := 0.0
	logoH := 0.0
	if len(assets.LogoTextPNG) > 0 {
		logoW = 120.0
		logoH = 30.0
		if h, err := gopdf.ImageHolderByBytes(assets.LogoTextPNG); err == nil {
			_ = pdf.ImageByHolder(h, left, y, &gopdf.Rect{W: logoW, H: logoH})
		}
	}

	titleX := left
	if logoW > 0 {
		titleX = left + logoW + 12
	}

	_ = pdf.SetFont("dejavubd", "", 14)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(titleX, y)
	_ = pdf.Cell(&gopdf.Rect{W: innerW - logoW - 12, H: 18}, l.ReportTitle)

	_ = pdf.SetFont("dejavu", "", 9)
	pdf.SetTextColor(80, 80, 80)
	y2 := y + 20
	if input.UnitName != "" {
		pdf.SetXY(titleX, y2)
		_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, input.UnitName)
		y2 += 13
	}

	period := fmt.Sprintf("%s %s — %s", l.Period, input.DateFrom, input.DateTo)
	pdf.SetXY(titleX, y2)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, period)
	y2 += 13

	var filters []string
	if input.FilterZone != "" {
		filters = append(filters, l.Zone+" "+input.FilterZone)
	}
	if input.FilterOperator != "" {
		filters = append(filters, l.Operator+" "+input.FilterOperator)
	}
	if len(filters) > 0 {
		pdf.SetXY(titleX, y2)
		_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, strings.Join(filters, "  |  "))
		y2 += 13
	}

	generated := fmt.Sprintf("%s %s", l.Generated, time.Now().UTC().Format("2006-01-02 15:04 UTC"))
	pdf.SetTextColor(140, 140, 140)
	_ = pdf.SetFont("dejavu", "", 7.5)
	pdf.SetXY(titleX, y2)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 10}, generated)
	y2 += 12

	ruleY := y2 + 2
	pdf.SetLineWidth(0.6)
	pdf.SetStrokeColor(55, 65, 81)
	pdf.Line(left, ruleY, left+innerW, ruleY)
	pdf.SetStrokeColor(0, 0, 0)

	_ = logoH
	return ruleY + 10
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA Summary card
// ─────────────────────────────────────────────────────────────────────────────

// slaSummaryCardHeight returns the pixel height of the SLA summary card
// based on which SLA types have data. Exported for tests.
func slaSummaryCardHeight(hasWait, hasSvc bool) float64 {
	if hasWait && hasSvc {
		return 96.0
	}
	return 48.0
}

func drawStatsSLASummaryCard(pdf *gopdf.GoPdf, left, y, innerW float64, sla *SlaSummaryResponse, l StatsPDFLabels) float64 {
	hasWait := sla.SlaWaitTotal > 0
	hasSvc := sla.SlaServiceTotal > 0
	hasBoth := hasWait && hasSvc
	cardH := slaSummaryCardHeight(hasWait, hasSvc)

	pdf.SetFillColor(240, 249, 255)
	pdf.RectFromUpperLeftWithStyle(left, y, innerW, cardH, "F")
	pdf.SetLineWidth(0.5)
	pdf.SetStrokeColor(147, 197, 253)
	pdf.RectFromUpperLeftWithStyle(left, y, innerW, cardH, "D")
	pdf.SetStrokeColor(0, 0, 0)

	// Title
	_ = pdf.SetFont("dejavubd", "", 10)
	pdf.SetTextColor(30, 64, 175)
	pdf.SetXY(left+10, y+6)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 14}, l.SLASummaryTitle)

	col1X := left + 10
	col2X := left + innerW*0.25
	col3X := left + innerW*0.5
	col4X := left + innerW*0.75

	drawSLARow := func(rowY float64, rowLabel string, within, breach string, met, total int) {
		// Show sub-header when both sections are present, or when only service SLA exists
		// (so the row isn't ambiguous without a wait row above it).
		if hasBoth || (!hasWait && rowLabel == l.SLAServiceTitle) {
			_ = pdf.SetFont("dejavubd", "", 7.5)
			pdf.SetTextColor(80, 100, 180)
			pdf.SetXY(col1X, rowY)
			_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 9}, rowLabel)
			rowY += 9
		}

		// Column labels
		_ = pdf.SetFont("dejavu", "", 8)
		pdf.SetTextColor(80, 80, 80)
		for _, lb := range []struct {
			x    float64
			text string
		}{
			{col1X, l.SLAWithin}, {col2X, l.SLABreach}, {col3X, l.SLAMet}, {col4X, l.SLATotal},
		} {
			pdf.SetXY(lb.x, rowY)
			_ = pdf.Cell(&gopdf.Rect{W: 90, H: 10}, lb.text)
		}
		rowY += 11

		// Values
		_ = pdf.SetFont("dejavubd", "", 11)
		pdf.SetTextColor(0, 0, 0)
		for _, v := range []struct {
			x    float64
			text string
		}{
			{col1X, within},
			{col2X, breach},
			{col3X, fmt.Sprintf("%d", met)},
			{col4X, fmt.Sprintf("%d", total)},
		} {
			pdf.SetXY(v.x, rowY)
			_ = pdf.Cell(&gopdf.Rect{W: 90, H: 14}, v.text)
		}
	}

	curY := y + 20
	if hasWait {
		drawSLARow(curY, l.SLAWaitTitle, fmt.Sprintf("%.1f%%", sla.WithinPct), fmt.Sprintf("%.1f%%", sla.BreachPct), sla.SlaWaitMet, sla.SlaWaitTotal)
		if hasBoth {
			curY += 36
		}
	}
	if hasSvc {
		var svcPct float64
		if sla.SlaServiceTotal > 0 {
			svcPct = float64(sla.SlaServiceMet) / float64(sla.SlaServiceTotal) * 100
		}
		breachPct := 100.0 - svcPct
		drawSLARow(curY, l.SLAServiceTitle, fmt.Sprintf("%.1f%%", svcPct), fmt.Sprintf("%.1f%%", breachPct), sla.SlaServiceMet, sla.SlaServiceTotal)
	}

	return y + cardH + 4
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: sectionHeader helper
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionHeader(pdf *gopdf.GoPdf, left, y, innerW float64, title string) float64 {
	_ = pdf.SetFont("dejavubd", "", 9.5)
	pdf.SetTextColor(30, 41, 59)
	for _, dx := range []float64{0, 0.25} {
		pdf.SetXY(left+dx, y)
		_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, title)
	}
	ruleY := y + 13
	pdf.SetLineWidth(0.3)
	pdf.SetStrokeColor(200, 200, 200)
	pdf.Line(left, ruleY, left+innerW, ruleY)
	pdf.SetStrokeColor(0, 0, 0)
	return ruleY + 4
}

func ensureSpaceForSection(
	pdf *gopdf.GoPdf,
	y, minNeeded float64,
	addPage func() (float64, error),
) (float64, error) {
	if y+minNeeded > pdfPageH-statsPdfFooterReserve {
		return addPage()
	}
	return y, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Timeseries (Wait & Service Time)
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionTimeseries(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *TimeseriesResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionTimeseries)

	hasServiceSLA := false
	for _, p := range data.Points {
		if p.SlaServiceTotal > 0 {
			hasServiceSLA = true
			break
		}
	}
	cols := []pdfColumnDef{
		{l.ColDate, 2.0, pdfAlignLeft},
		{l.ColAvgWait, 1.4, pdfAlignRight},
		{l.ColAvgService, 1.4, pdfAlignRight},
		{l.ColCreated, 0.9, pdfAlignRight},
		{l.ColCompleted, 0.9, pdfAlignRight},
		{l.ColNoShow, 0.9, pdfAlignRight},
		{l.ColSLAMetPct, 1.0, pdfAlignRight},
	}
	if hasServiceSLA {
		cols = append(cols, pdfColumnDef{l.ColSvcSLAMetPct, 1.1, pdfAlignRight})
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		row := []string{
			p.Date,
			fmtOptFloat(p.AvgWaitMinutes, 2),
			fmtOptFloat(p.AvgServiceMinutes, 2),
			fmt.Sprintf("%d", p.TicketsCreated),
			fmt.Sprintf("%d", p.TicketsCompleted),
			fmt.Sprintf("%d", p.NoShowCount),
			fmtOptPct(p.SlaWaitMetPct),
		}
		if hasServiceSLA {
			row = append(row, fmtOptPct(p.SlaServiceMetPct))
		}
		rows = append(rows, row)
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Load (Ticket Volume)
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionLoad(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *LoadResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionLoad)

	cols := []pdfColumnDef{
		{l.ColDate, 2.5, pdfAlignLeft},
		{l.ColCreated, 1.0, pdfAlignRight},
		{l.ColCompleted, 1.0, pdfAlignRight},
		{l.ColNoShow, 1.0, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		rows = append(rows, []string{
			p.Date,
			fmt.Sprintf("%d", p.TicketsCreated),
			fmt.Sprintf("%d", p.TicketsCompleted),
			fmt.Sprintf("%d", p.NoShowCount),
		})
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: SLA Deviations
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionSLADeviations(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *SLADeviationsResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionSLADeviations)

	hasSvcSLA := false
	for _, p := range data.Points {
		if p.SlaServiceTotal > 0 {
			hasSvcSLA = true
			break
		}
	}
	cols := []pdfColumnDef{
		{l.ColDate, 2.0, pdfAlignLeft},
		{l.ColWithinPct, 1.4, pdfAlignRight},
		{l.ColBreachPct, 1.4, pdfAlignRight},
		{l.ColMet, 1.0, pdfAlignRight},
		{l.ColTotal, 1.0, pdfAlignRight},
	}
	if hasSvcSLA {
		cols = append(cols,
			pdfColumnDef{l.ColSvcSLAMetPct, 1.4, pdfAlignRight},
			pdfColumnDef{l.ColSvcMet, 1.0, pdfAlignRight},
			pdfColumnDef{l.ColSvcTotal, 1.0, pdfAlignRight},
		)
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		row := []string{
			p.Date,
			fmt.Sprintf("%.1f", p.WithinPct),
			fmt.Sprintf("%.1f", p.BreachPct),
			fmt.Sprintf("%d", p.SlaWaitMet),
			fmt.Sprintf("%d", p.SlaWaitTotal),
		}
		if hasSvcSLA {
			row = append(row,
				fmt.Sprintf("%.1f", p.SlaServiceMetPct),
				fmt.Sprintf("%d", p.SlaServiceMet),
				fmt.Sprintf("%d", p.SlaServiceTotal),
			)
		}
		rows = append(rows, row)
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Tickets by Service
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionTicketsByService(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *TicketsByServiceResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionTicketsBySvc)

	cols := []pdfColumnDef{
		{l.ColService, 4.0, pdfAlignLeft},
		{l.ColCount, 1.0, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Items)+1)
	for _, item := range data.Items {
		rows = append(rows, []string{item.ServiceName, fmt.Sprintf("%d", item.Count)})
	}
	rows = append(rows, []string{l.ColTotal, fmt.Sprintf("%d", data.Total)})

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Survey Scores
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionSurvey(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *SurveyScoresResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionSurvey)

	cols := []pdfColumnDef{
		{l.ColDate, 2.0, pdfAlignLeft},
		{l.ColAvgScoreNorm, 1.5, pdfAlignRight},
		{l.ColAvgScoreNative, 1.5, pdfAlignRight},
		{l.ColQuestionID, 2.0, pdfAlignLeft},
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		rows = append(rows, []string{
			p.Date,
			fmtOptFloat(p.AvgScoreNorm5, 2),
			fmtOptFloat(p.AvgScoreNative, 2),
			p.QuestionID,
		})
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Utilization
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionUtilization(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *UtilizationResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionUtilization)

	cols := []pdfColumnDef{
		{l.ColDate, 2.0, pdfAlignLeft},
		{l.ColServingMin, 1.5, pdfAlignRight},
		{l.ColIdleMin, 1.5, pdfAlignRight},
		{l.ColUtilPct, 1.5, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		rows = append(rows, []string{
			p.Date,
			fmt.Sprintf("%.1f", p.ServingMinutes),
			fmt.Sprintf("%.1f", p.IdleMinutes),
			fmtOptPct(p.UtilizationPct),
		})
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Employee Radar
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSectionRadar(
	pdf *gopdf.GoPdf, left, y, innerW float64,
	data *EmployeeRadarResponse,
	cfg pdfTableConfig,
	addPage func() (float64, error),
	l StatsPDFLabels,
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, l.SectionRadar)

	cols := []pdfColumnDef{
		{l.ColMetric, 3.0, pdfAlignLeft},
		{l.ColValue, 1.5, pdfAlignRight},
	}
	rows := [][]string{
		{l.RadarRating, fmt.Sprintf("%.1f", data.Rating)},
		{l.RadarSLAWait, fmt.Sprintf("%.1f", data.SlaWait)},
		{l.RadarSLAService, fmt.Sprintf("%.1f", data.SlaService)},
		{l.RadarTicketsPerH, fmt.Sprintf("%.1f", data.TicketsPerHour)},
	}

	return statsPdfDrawTable(pdf, left, y, innerW, cols, rows, cfg, addPage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

func fmtOptFloat(v *float64, prec int) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf("%.*f", prec, *v)
}

func fmtOptPct(v *float64) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf("%.1f%%", *v)
}
