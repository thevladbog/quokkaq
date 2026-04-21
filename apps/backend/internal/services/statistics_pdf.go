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

	// ── Title header ────────────────────────────────────────────────
	y = drawStatsReportHeader(&pdf, left, y, innerW, input)

	// ── SLA Summary (highlighted card) ──────────────────────────────
	if input.SlaSummary != nil && input.SlaSummary.SlaWaitTotal > 0 {
		y = drawStatsSLASummaryCard(&pdf, left, y, innerW, input.SlaSummary)
		y += statsPdfSectionGap
	}

	sectionAddPage := func() (float64, error) {
		newY, err := addPage()
		return newY, err
	}

	// ── Wait & Service Time (Timeseries) ────────────────────────────
	if input.Timeseries != nil && len(input.Timeseries.Points) > 0 {
		y, err = drawStatsSectionTimeseries(&pdf, left, y, innerW, input.Timeseries, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Ticket Volume (Load) ────────────────────────────────────────
	if input.Load != nil && len(input.Load.Points) > 0 {
		y, err = drawStatsSectionLoad(&pdf, left, y, innerW, input.Load, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── SLA Deviations ──────────────────────────────────────────────
	if input.SLADeviations != nil && len(input.SLADeviations.Points) > 0 {
		y, err = drawStatsSectionSLADeviations(&pdf, left, y, innerW, input.SLADeviations, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Tickets by Service ──────────────────────────────────────────
	if input.TicketsSvc != nil && len(input.TicketsSvc.Items) > 0 {
		y, err = drawStatsSectionTicketsByService(&pdf, left, y, innerW, input.TicketsSvc, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Survey Scores ───────────────────────────────────────────────
	if input.SurveyScores != nil && len(input.SurveyScores.Points) > 0 {
		y, err = drawStatsSectionSurvey(&pdf, left, y, innerW, input.SurveyScores, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Utilization ─────────────────────────────────────────────────
	if input.Utilization != nil && len(input.Utilization.Points) > 0 {
		y, err = drawStatsSectionUtilization(&pdf, left, y, innerW, input.Utilization, tblCfg, sectionAddPage)
		if err != nil {
			return nil, err
		}
		y += statsPdfSectionGap
	}

	// ── Employee Radar ──────────────────────────────────────────────
	if input.EmployeeRadar != nil && input.EmployeeRadar.UserID != "" {
		y, err = drawStatsSectionRadar(&pdf, left, y, innerW, input.EmployeeRadar, tblCfg, sectionAddPage)
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
	_ = pdf.Cell(&gopdf.Rect{W: innerW - logoW - 12, H: 18}, "Statistics Report")

	_ = pdf.SetFont("dejavu", "", 9)
	pdf.SetTextColor(80, 80, 80)
	y2 := y + 20
	if input.UnitName != "" {
		pdf.SetXY(titleX, y2)
		_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, input.UnitName)
		y2 += 13
	}

	period := fmt.Sprintf("Period: %s — %s", input.DateFrom, input.DateTo)
	pdf.SetXY(titleX, y2)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, period)
	y2 += 13

	var filters []string
	if input.FilterZone != "" {
		filters = append(filters, "Zone: "+input.FilterZone)
	}
	if input.FilterOperator != "" {
		filters = append(filters, "Operator: "+input.FilterOperator)
	}
	if len(filters) > 0 {
		pdf.SetXY(titleX, y2)
		_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 12}, strings.Join(filters, "  |  "))
		y2 += 13
	}

	generated := fmt.Sprintf("Generated: %s", time.Now().UTC().Format("2006-01-02 15:04 UTC"))
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

	return ruleY + 10
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA Summary card
// ─────────────────────────────────────────────────────────────────────────────

func drawStatsSLASummaryCard(pdf *gopdf.GoPdf, left, y, innerW float64, sla *SlaSummaryResponse) float64 {
	cardH := 48.0
	pdf.SetFillColor(240, 249, 255)
	pdf.RectFromUpperLeftWithStyle(left, y, innerW, cardH, "F")
	pdf.SetLineWidth(0.5)
	pdf.SetStrokeColor(147, 197, 253)
	pdf.RectFromUpperLeftWithStyle(left, y, innerW, cardH, "D")
	pdf.SetStrokeColor(0, 0, 0)

	_ = pdf.SetFont("dejavubd", "", 10)
	pdf.SetTextColor(30, 64, 175)
	pdf.SetXY(left+10, y+6)
	_ = pdf.Cell(&gopdf.Rect{W: innerW, H: 14}, "WAITING SLA SUMMARY")

	col1X := left + 10
	col2X := left + innerW*0.25
	col3X := left + innerW*0.5
	col4X := left + innerW*0.75
	valY := y + 24

	_ = pdf.SetFont("dejavu", "", 8)
	pdf.SetTextColor(80, 80, 80)
	labels := []struct {
		x    float64
		text string
	}{
		{col1X, "Within SLA"}, {col2X, "Breach"}, {col3X, "Met"}, {col4X, "Total"},
	}
	for _, l := range labels {
		pdf.SetXY(l.x, valY)
		_ = pdf.Cell(&gopdf.Rect{W: 90, H: 10}, l.text)
	}
	valY += 11

	_ = pdf.SetFont("dejavubd", "", 11)
	pdf.SetTextColor(0, 0, 0)
	values := []struct {
		x    float64
		text string
	}{
		{col1X, fmt.Sprintf("%.1f%%", sla.WithinPct)},
		{col2X, fmt.Sprintf("%.1f%%", sla.BreachPct)},
		{col3X, fmt.Sprintf("%d", sla.SlaWaitMet)},
		{col4X, fmt.Sprintf("%d", sla.SlaWaitTotal)},
	}
	for _, v := range values {
		pdf.SetXY(v.x, valY)
		_ = pdf.Cell(&gopdf.Rect{W: 90, H: 14}, v.text)
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "WAIT & SERVICE TIME")

	cols := []pdfColumnDef{
		{"Date", 2.0, pdfAlignLeft},
		{"Avg Wait (min)", 1.5, pdfAlignRight},
		{"Avg Service (min)", 1.5, pdfAlignRight},
		{"Created", 1.0, pdfAlignRight},
		{"Completed", 1.0, pdfAlignRight},
		{"No-Show", 1.0, pdfAlignRight},
		{"SLA Met %", 1.0, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		rows = append(rows, []string{
			p.Date,
			fmtOptFloat(p.AvgWaitMinutes, 2),
			fmtOptFloat(p.AvgServiceMinutes, 2),
			fmt.Sprintf("%d", p.TicketsCreated),
			fmt.Sprintf("%d", p.TicketsCompleted),
			fmt.Sprintf("%d", p.NoShowCount),
			fmtOptPct(p.SlaWaitMetPct),
		})
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "TICKET VOLUME")

	cols := []pdfColumnDef{
		{"Date", 2.5, pdfAlignLeft},
		{"Created", 1.0, pdfAlignRight},
		{"Completed", 1.0, pdfAlignRight},
		{"No-Show", 1.0, pdfAlignRight},
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "SLA DEVIATIONS")

	cols := []pdfColumnDef{
		{"Date", 2.0, pdfAlignLeft},
		{"Within %", 1.5, pdfAlignRight},
		{"Breach %", 1.5, pdfAlignRight},
		{"Met", 1.0, pdfAlignRight},
		{"Total", 1.0, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Points))
	for _, p := range data.Points {
		rows = append(rows, []string{
			p.Date,
			fmt.Sprintf("%.1f", p.WithinPct),
			fmt.Sprintf("%.1f", p.BreachPct),
			fmt.Sprintf("%d", p.SlaWaitMet),
			fmt.Sprintf("%d", p.SlaWaitTotal),
		})
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "TICKETS BY SERVICE")

	cols := []pdfColumnDef{
		{"Service", 4.0, pdfAlignLeft},
		{"Count", 1.0, pdfAlignRight},
	}
	rows := make([][]string, 0, len(data.Items)+1)
	for _, item := range data.Items {
		rows = append(rows, []string{item.ServiceName, fmt.Sprintf("%d", item.Count)})
	}
	rows = append(rows, []string{"Total", fmt.Sprintf("%d", data.Total)})

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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "SURVEY SCORES")

	cols := []pdfColumnDef{
		{"Date", 2.0, pdfAlignLeft},
		{"Avg Score (norm 5)", 1.5, pdfAlignRight},
		{"Avg Score (native)", 1.5, pdfAlignRight},
		{"Question ID", 2.0, pdfAlignLeft},
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "OPERATOR UTILIZATION")

	cols := []pdfColumnDef{
		{"Date", 2.0, pdfAlignLeft},
		{"Serving (min)", 1.5, pdfAlignRight},
		{"Idle (min)", 1.5, pdfAlignRight},
		{"Utilization %", 1.5, pdfAlignRight},
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
) (float64, error) {
	y, err := ensureSpaceForSection(pdf, y, 60, addPage)
	if err != nil {
		return y, err
	}
	y = drawStatsSectionHeader(pdf, left, y, innerW, "EMPLOYEE RADAR")

	cols := []pdfColumnDef{
		{"Metric", 3.0, pdfAlignLeft},
		{"Value", 1.5, pdfAlignRight},
	}
	rows := [][]string{
		{"Rating", fmt.Sprintf("%.1f", data.Rating)},
		{"SLA Wait", fmt.Sprintf("%.1f", data.SlaWait)},
		{"SLA Service", fmt.Sprintf("%.1f", data.SlaService)},
		{"Tickets / Hour", fmt.Sprintf("%.1f", data.TicketsPerHour)},
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
