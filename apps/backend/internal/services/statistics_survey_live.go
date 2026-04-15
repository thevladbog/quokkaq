package services

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
)

// surveyPeriodAgg holds norm5/native accumulators for one calendar day or one clock hour.
type surveyPeriodAgg struct {
	all         *surveyAcc
	perSurvey   map[string]*surveyAcc
	perQuestion map[string]*surveyAcc
}

func newSurveyPeriodAgg() *surveyPeriodAgg {
	return &surveyPeriodAgg{
		perSurvey:   make(map[string]*surveyAcc),
		perQuestion: make(map[string]*surveyAcc),
	}
}

func (a *surveyPeriodAgg) touchAll() *surveyAcc {
	if a.all == nil {
		a.all = &surveyAcc{}
	}
	return a.all
}

func (a *surveyPeriodAgg) touchSurvey(sid string) *surveyAcc {
	sid = strings.TrimSpace(sid)
	if a.perSurvey[sid] == nil {
		a.perSurvey[sid] = &surveyAcc{}
	}
	return a.perSurvey[sid]
}

func (a *surveyPeriodAgg) touchQuestion(surveyID, qid string, qmin, qmax float64) *surveyAcc {
	key := surveyID + "\x00" + qid
	if a.perQuestion[key] == nil {
		minC, maxC := qmin, qmax
		a.perQuestion[key] = &surveyAcc{smin: &minC, smax: &maxC}
	}
	return a.perQuestion[key]
}

func accumulateResponseIntoPeriod(
	resp models.SurveyResponse,
	pd parsedSurveyDef,
	agg *surveyPeriodAgg,
) {
	if len(resp.Answers) == 0 || string(resp.Answers) == "null" {
		return
	}
	var ans map[string]interface{}
	if json.Unmarshal(resp.Answers, &ans) != nil {
		return
	}
	for _, q := range pd.Questions {
		raw, ok := ans[q.ID]
		if !ok {
			continue
		}
		v, ok := floatFromAnswer(raw)
		if !ok || math.IsNaN(v) {
			continue
		}
		all := agg.touchAll()
		if q.Max > q.Min {
			n5 := normTo5(v, q.Min, q.Max)
			all.sumNorm5 += n5
			all.nNorm5++
			sa := agg.touchSurvey(pd.SurveyDefinitionID)
			sa.sumNorm5 += n5
			sa.nNorm5++
		}
		qa := agg.touchQuestion(pd.SurveyDefinitionID, q.ID, q.Min, q.Max)
		qa.sumNat += v
		qa.nNat++
	}
}

// surveySubdivisionScopeIDs returns subdivisionID plus direct service_zone children (same scope as survey definitions).
func (s *StatisticsService) surveySubdivisionScopeIDs(ctx context.Context, subdivisionID string) ([]string, error) {
	var zoneIDs []string
	if err := s.db.WithContext(ctx).Model(&models.Unit{}).
		Where("parent_id = ? AND kind = ?", subdivisionID, models.UnitKindServiceZone).
		Pluck("id", &zoneIDs).Error; err != nil {
		return nil, err
	}
	return append([]string{subdivisionID}, zoneIDs...), nil
}

func (s *StatisticsService) loadSurveyDefinitionsForScopeIDs(
	ctx context.Context,
	scopeIDs []string,
) (map[string]parsedSurveyDef, error) {
	var defs []models.SurveyDefinition
	if err := s.db.WithContext(ctx).Where("scope_unit_id IN ?", scopeIDs).Find(&defs).Error; err != nil {
		return nil, err
	}
	defByID := make(map[string]parsedSurveyDef, len(defs))
	for i := range defs {
		d := defs[i]
		defByID[d.ID] = parsedSurveyDef{
			SurveyDefinitionID: d.ID,
			Questions:          parseSurveyQuestions(d.Questions),
		}
	}
	return defByID, nil
}

// getSurveyScoresLive aggregates guest survey scores from raw survey_responses.
// Responses are stored with unit_id = ticket unit (often a service_zone); include subdivision + its zones.
// Single calendar day → one point per clock hour in the subdivision timezone; multiple days → one point per day.
func (s *StatisticsService) getSurveyScoresLive(
	ctx context.Context,
	subdivisionID string,
	dateFrom, dateTo string,
	surveyID *string,
	questionIDs []string,
) (*SurveyScoresResponse, error) {
	mode := "all_surveys"
	switch {
	case len(questionIDs) > 0:
		mode = "questions"
	case surveyID != nil && strings.TrimSpace(*surveyID) != "":
		mode = "one_survey"
	}

	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}

	days, err := statisticsDayListInLocation(loc, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}

	df, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateFrom), loc)
	if err != nil {
		return nil, err
	}
	dt, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateTo), loc)
	if err != nil {
		return nil, err
	}
	startUTC := time.Date(df.Year(), df.Month(), df.Day(), 0, 0, 0, 0, loc).UTC()
	endUTC := time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1).UTC()

	scopeIDs, err := s.surveySubdivisionScopeIDs(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}

	var responses []models.SurveyResponse
	if err := s.db.WithContext(ctx).Where(
		"unit_id IN ? AND submitted_at >= ? AND submitted_at < ?",
		scopeIDs, startUTC, endUTC,
	).Find(&responses).Error; err != nil {
		return nil, err
	}

	defByID, err := s.loadSurveyDefinitionsForScopeIDs(ctx, scopeIDs)
	if err != nil {
		return nil, err
	}

	hourly := len(days) == 1
	singleDay := days[0]

	var (
		byDay  map[string]*surveyPeriodAgg
		byHour [24]*surveyPeriodAgg
	)

	if hourly {
		for i := range byHour {
			byHour[i] = newSurveyPeriodAgg()
		}
	} else {
		byDay = make(map[string]*surveyPeriodAgg)
		for _, d := range days {
			byDay[d] = newSurveyPeriodAgg()
		}
	}

	for _, resp := range responses {
		pd, ok := defByID[resp.SurveyDefinitionID]
		if !ok || len(pd.Questions) == 0 {
			continue
		}
		lt := resp.SubmittedAt.In(loc)
		dayKey := lt.Format("2006-01-02")
		if hourly {
			if dayKey != singleDay {
				continue
			}
			h := lt.Hour()
			accumulateResponseIntoPeriod(resp, pd, byHour[h])
		} else {
			agg := byDay[dayKey]
			if agg == nil {
				continue
			}
			accumulateResponseIntoPeriod(resp, pd, agg)
		}
	}

	points := make([]SurveyScorePoint, 0)

	if hourly {
		for h := 0; h < 24; h++ {
			label := hourlyDateLabel(singleDay, h)
			agg := byHour[h]
			switch mode {
			case "all_surveys":
				pt := SurveyScorePoint{Date: label}
				if agg.all != nil && agg.all.nNorm5 > 0 {
					v := agg.all.sumNorm5 / float64(agg.all.nNorm5)
					pt.AvgScoreNorm5 = &v
				}
				points = append(points, pt)
			case "one_survey":
				pt := SurveyScorePoint{Date: label}
				sid := strings.TrimSpace(*surveyID)
				if sa := agg.perSurvey[sid]; sa != nil && sa.nNorm5 > 0 {
					v := sa.sumNorm5 / float64(sa.nNorm5)
					pt.AvgScoreNorm5 = &v
				}
				points = append(points, pt)
			case "questions":
				sid := strings.TrimSpace(*surveyID)
				for _, qid := range questionIDs {
					qid = strings.TrimSpace(qid)
					if qid == "" {
						continue
					}
					pt := SurveyScorePoint{Date: label, QuestionID: qid}
					key := sid + "\x00" + qid
					if qa := agg.perQuestion[key]; qa != nil && qa.nNat > 0 {
						v := qa.sumNat / float64(qa.nNat)
						pt.AvgScoreNative = &v
						pt.ScaleMin = qa.smin
						pt.ScaleMax = qa.smax
					}
					points = append(points, pt)
				}
			}
		}
	} else {
		for _, d := range days {
			agg := byDay[d]
			switch mode {
			case "all_surveys":
				pt := SurveyScorePoint{Date: d}
				if agg.all != nil && agg.all.nNorm5 > 0 {
					v := agg.all.sumNorm5 / float64(agg.all.nNorm5)
					pt.AvgScoreNorm5 = &v
				}
				points = append(points, pt)
			case "one_survey":
				pt := SurveyScorePoint{Date: d}
				sid := strings.TrimSpace(*surveyID)
				if sa := agg.perSurvey[sid]; sa != nil && sa.nNorm5 > 0 {
					v := sa.sumNorm5 / float64(sa.nNorm5)
					pt.AvgScoreNorm5 = &v
				}
				points = append(points, pt)
			case "questions":
				sid := strings.TrimSpace(*surveyID)
				for _, qid := range questionIDs {
					qid = strings.TrimSpace(qid)
					if qid == "" {
						continue
					}
					key := sid + "\x00" + qid
					qa := agg.perQuestion[key]
					pt := SurveyScorePoint{Date: d, QuestionID: qid}
					if qa != nil && qa.nNat > 0 {
						v := qa.sumNat / float64(qa.nNat)
						pt.AvgScoreNative = &v
						pt.ScaleMin = qa.smin
						pt.ScaleMax = qa.smax
					}
					points = append(points, pt)
				}
			}
		}
	}

	granularity := "day"
	if hourly {
		granularity = "hour"
	}
	now := time.Now().UTC()
	return &SurveyScoresResponse{
		Mode:        mode,
		Points:      points,
		Granularity: granularity,
		ComputedAt:  &now,
	}, nil
}
