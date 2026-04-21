package services

// StatsPDFLabels holds all translatable strings for the statistics PDF report.
type StatsPDFLabels struct {
	ReportTitle string
	Period      string
	Zone        string
	Operator    string
	Generated   string

	SLASummaryTitle string
	SLAWaitTitle    string
	SLAServiceTitle string
	SLAWithin       string
	SLABreach       string
	SLAMet          string
	SLATotal        string

	SectionTimeseries    string
	SectionLoad          string
	SectionSLADeviations string
	SectionTicketsBySvc  string
	SectionSurvey        string
	SectionUtilization   string
	SectionRadar         string
	SectionStaffLeader   string
	SectionStaffForecast string

	ColDate           string
	ColAvgWait        string
	ColAvgService     string
	ColCreated        string
	ColCompleted      string
	ColNoShow         string
	ColSLAMetPct      string
	ColWithinPct      string
	ColBreachPct      string
	ColMet            string
	ColTotal          string
	ColSvcSLAMetPct   string
	ColSvcMet         string
	ColSvcTotal       string
	ColService        string
	ColCount          string
	ColAvgScoreNorm   string
	ColAvgScoreNative string
	ColQuestionID     string
	ColServingMin     string
	ColIdleMin        string
	ColUtilPct        string
	ColMetric         string
	ColValue          string

	RadarRating      string
	RadarSLAWait     string
	RadarSLAService  string
	RadarTicketsPerH string

	ColOperator   string
	ColTickets    string
	ColSLAWait    string
	ColSLAService string
	ColUtil       string
	ColCSAT       string

	ColHour         string
	ColRecommended  string
	ColExpectedWait string
	ColSLAPct       string
	ColArrivalRate  string
}

// StatsPDFLabelsEN returns English labels for the statistics PDF.
func StatsPDFLabelsEN() StatsPDFLabels {
	return StatsPDFLabels{
		ReportTitle: "Statistics Report",
		Period:      "Period:",
		Zone:        "Zone:",
		Operator:    "Operator:",
		Generated:   "Generated:",

		SLASummaryTitle: "SLA SUMMARY",
		SLAWaitTitle:    "WAIT SLA",
		SLAServiceTitle: "SERVICE SLA",
		SLAWithin:       "Within SLA",
		SLABreach:       "Breach",
		SLAMet:          "Met",
		SLATotal:        "Total",

		SectionTimeseries:    "WAIT & SERVICE TIME",
		SectionLoad:          "TICKET VOLUME",
		SectionSLADeviations: "SLA DEVIATIONS",
		SectionTicketsBySvc:  "TICKETS BY SERVICE",
		SectionSurvey:        "SURVEY SCORES",
		SectionUtilization:   "OPERATOR UTILIZATION",
		SectionRadar:         "EMPLOYEE RADAR",
		SectionStaffLeader:   "STAFF PERFORMANCE LEADERBOARD",
		SectionStaffForecast: "STAFFING RECOMMENDATIONS",

		ColDate:           "Date",
		ColAvgWait:        "Avg Wait (min)",
		ColAvgService:     "Avg Service (min)",
		ColCreated:        "Created",
		ColCompleted:      "Completed",
		ColNoShow:         "No-Show",
		ColSLAMetPct:      "SLA Met % (wait)",
		ColWithinPct:      "Within % (wait)",
		ColBreachPct:      "Breach % (wait)",
		ColMet:            "Met (wait)",
		ColTotal:          "Total (wait)",
		ColSvcSLAMetPct:   "SLA Met % (service)",
		ColSvcMet:         "Met (service)",
		ColSvcTotal:       "Total (service)",
		ColService:        "Service",
		ColCount:          "Count",
		ColAvgScoreNorm:   "Avg Score (norm 5)",
		ColAvgScoreNative: "Avg Score (native)",
		ColQuestionID:     "Question ID",
		ColServingMin:     "Serving (min)",
		ColIdleMin:        "Idle (min)",
		ColUtilPct:        "Utilization %",
		ColMetric:         "Metric",
		ColValue:          "Value",

		RadarRating:      "Rating",
		RadarSLAWait:     "SLA Wait",
		RadarSLAService:  "SLA Service",
		RadarTicketsPerH: "Tickets / Hour",

		ColOperator:   "Operator",
		ColTickets:    "Tickets",
		ColSLAWait:    "SLA Wait %",
		ColSLAService: "SLA Svc %",
		ColUtil:       "Util %",
		ColCSAT:       "CSAT",

		ColHour:         "Hour",
		ColRecommended:  "Agents",
		ColExpectedWait: "Exp. Wait (min)",
		ColSLAPct:       "SLA %",
		ColArrivalRate:  "Arrivals/h",
	}
}

// StatsPDFLabelsRU returns Russian labels for the statistics PDF.
func StatsPDFLabelsRU() StatsPDFLabels {
	return StatsPDFLabels{
		ReportTitle: "Отчёт по статистике",
		Period:      "Период:",
		Zone:        "Зона:",
		Operator:    "Оператор:",
		Generated:   "Сформирован:",

		SLASummaryTitle: "СВОДКА SLA",
		SLAWaitTitle:    "SLA ОЖИДАНИЯ",
		SLAServiceTitle: "SLA ОБСЛУЖИВАНИЯ",
		SLAWithin:       "В пределах SLA",
		SLABreach:       "Нарушение",
		SLAMet:          "Выполнено",
		SLATotal:        "Итого",

		SectionTimeseries:    "ОЖИДАНИЕ И ОБСЛУЖИВАНИЕ",
		SectionLoad:          "ОБЪЁМ ТАЛОНОВ",
		SectionSLADeviations: "ОТКЛОНЕНИЯ SLA",
		SectionTicketsBySvc:  "ТАЛОНЫ ПО УСЛУГАМ",
		SectionSurvey:        "ГОСТЕВЫЕ ОПРОСЫ",
		SectionUtilization:   "ЗАГРУЗКА ОПЕРАТОРА",
		SectionRadar:         "ПРОФИЛЬ СОТРУДНИКА",
		SectionStaffLeader:   "РЕЙТИНГ ОПЕРАТОРОВ",
		SectionStaffForecast: "РЕКОМЕНДАЦИИ ПО ШТАТНОМУ РАСПИСАНИЮ",

		ColDate:           "Дата",
		ColAvgWait:        "Ср. ожидание (мин)",
		ColAvgService:     "Ср. обслуж. (мин)",
		ColCreated:        "Создано",
		ColCompleted:      "Завершено",
		ColNoShow:         "Неявка",
		ColSLAMetPct:      "SLA выполнен % (ожид.)",
		ColWithinPct:      "В пределах % (ожид.)",
		ColBreachPct:      "Нарушение % (ожид.)",
		ColMet:            "Выполнено (ожид.)",
		ColTotal:          "Итого (ожид.)",
		ColSvcSLAMetPct:   "SLA выполнен % (обсл.)",
		ColSvcMet:         "Выполнено (обсл.)",
		ColSvcTotal:       "Итого (обсл.)",
		ColService:        "Услуга",
		ColCount:          "Кол-во",
		ColAvgScoreNorm:   "Ср. балл (норм. 5)",
		ColAvgScoreNative: "Ср. балл (шкала)",
		ColQuestionID:     "ID вопроса",
		ColServingMin:     "Обслуживание (мин)",
		ColIdleMin:        "Простой (мин)",
		ColUtilPct:        "Загрузка %",
		ColMetric:         "Метрика",
		ColValue:          "Значение",

		RadarRating:      "Рейтинг",
		RadarSLAWait:     "SLA ожидания",
		RadarSLAService:  "SLA обслуживания",
		RadarTicketsPerH: "Талонов / час",

		ColOperator:   "Оператор",
		ColTickets:    "Талоны",
		ColSLAWait:    "SLA ожид. %",
		ColSLAService: "SLA обсл. %",
		ColUtil:       "Загрузка %",
		ColCSAT:       "CSAT",

		ColHour:         "Час",
		ColRecommended:  "Агентов",
		ColExpectedWait: "Ожид. (мин)",
		ColSLAPct:       "SLA %",
		ColArrivalRate:  "Заявок/ч",
	}
}
