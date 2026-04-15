package services

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

type surveyQMeta struct {
	ID      string
	Min     float64
	Max     float64
	Numeric bool
}

type parsedSurveyDef struct {
	SurveyDefinitionID string
	Questions          []surveyQMeta
}

// parseSurveyQuestions understands the same shapes as the frontend guest-survey editor:
// - legacy: JSON array of question objects
// - wrapped: { "displayMode": "single_page"|"stepped", "blocks": [ ... ] }
func parseSurveyQuestions(raw json.RawMessage) []surveyQMeta {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	raw = bytes.TrimSpace(raw)
	var elements []json.RawMessage
	switch {
	case len(raw) > 0 && raw[0] == '[':
		if json.Unmarshal(raw, &elements) != nil {
			return nil
		}
	case len(raw) > 0 && raw[0] == '{':
		var wrapped struct {
			Blocks []json.RawMessage `json:"blocks"`
		}
		if json.Unmarshal(raw, &wrapped) != nil || len(wrapped.Blocks) == 0 {
			return nil
		}
		elements = wrapped.Blocks
	default:
		return nil
	}
	return parseSurveyQuestionBlocks(elements)
}

func parseSurveyQuestionBlocks(arr []json.RawMessage) []surveyQMeta {
	out := make([]surveyQMeta, 0, len(arr))
	for _, el := range arr {
		var m map[string]interface{}
		if json.Unmarshal(el, &m) != nil {
			continue
		}
		id, _ := m["id"].(string)
		if strings.TrimSpace(id) == "" {
			continue
		}
		typ, _ := m["type"].(string)
		typ = strings.ToLower(strings.TrimSpace(typ))
		numeric := typ == "stars" || typ == "rating" || typ == "nps" || typ == "number" || typ == "scale"
		if !numeric {
			continue
		}
		minV, maxV := 0.0, 5.0
		if v, ok := toFloat64(m["min"]); ok {
			minV = v
		}
		if v, ok := toFloat64(m["max"]); ok {
			maxV = v
		}
		if typ == "nps" && minV == 0 && maxV == 5 {
			minV, maxV = 0, 10
		}
		// Icon scale is always 1–5 in stored JSON (see guest-survey editor).
		if typ == "scale" {
			if pres, _ := m["presentation"].(string); strings.EqualFold(strings.TrimSpace(pres), "icons") {
				minV, maxV = 1, 5
			}
		}
		out = append(out, surveyQMeta{ID: id, Min: minV, Max: maxV, Numeric: true})
	}
	return out
}

func toFloat64(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	default:
		return 0, false
	}
}

func floatFromAnswer(raw interface{}) (float64, bool) {
	switch x := raw.(type) {
	case float64:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		return f, err == nil
	default:
		return toFloat64(x)
	}
}

func normTo5(v, minV, maxV float64) float64 {
	if maxV <= minV {
		return 0
	}
	t := (v - minV) / (maxV - minV)
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	return 1 + 4*t
}

type surveyAcc struct {
	sumNorm5 float64
	nNorm5   int
	sumNat   float64
	nNat     int
	smin     *float64
	smax     *float64
}

func (s *StatisticsRefreshService) rollupSurveyDay(unitID, bucketDate string, startUTC, endUTC time.Time) error {
	if err := s.statsRepo.DeleteSurveyDailyForUnitDay(unitID, bucketDate); err != nil {
		return err
	}

	var zoneIDs []string
	if err := s.db.Model(&models.Unit{}).
		Where("parent_id = ? AND kind = ?", unitID, models.UnitKindServiceZone).
		Pluck("id", &zoneIDs).Error; err != nil {
		return err
	}
	scopeIDs := append([]string{unitID}, zoneIDs...)

	var defs []models.SurveyDefinition
	if err := s.db.Where("scope_unit_id IN ?", scopeIDs).Find(&defs).Error; err != nil {
		return err
	}
	defByID := make(map[string]parsedSurveyDef, len(defs))
	for i := range defs {
		d := defs[i]
		defByID[d.ID] = parsedSurveyDef{
			SurveyDefinitionID: d.ID,
			Questions:          parseSurveyQuestions(d.Questions),
		}
	}

	var responses []models.SurveyResponse
	if err := s.db.Where(
		`unit_id IN (SELECT id FROM units WHERE id = ? OR parent_id = ?) AND submitted_at >= ? AND submitted_at < ?`,
		unitID, unitID, startUTC, endUTC,
	).Find(&responses).Error; err != nil {
		return err
	}

	var all surveyAcc
	perSurvey := make(map[string]*surveyAcc)
	perQuestion := make(map[string]*surveyAcc)

	for _, resp := range responses {
		pd, ok := defByID[resp.SurveyDefinitionID]
		if !ok || len(pd.Questions) == 0 {
			continue
		}
		var ans map[string]interface{}
		if len(resp.Answers) == 0 || string(resp.Answers) == "null" {
			continue
		}
		if json.Unmarshal(resp.Answers, &ans) != nil {
			continue
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
			if q.Max > q.Min {
				n5 := normTo5(v, q.Min, q.Max)
				all.sumNorm5 += n5
				all.nNorm5++
				sa := perSurvey[pd.SurveyDefinitionID]
				if sa == nil {
					sa = &surveyAcc{}
					perSurvey[pd.SurveyDefinitionID] = sa
				}
				sa.sumNorm5 += n5
				sa.nNorm5++
			}
			qkey := pd.SurveyDefinitionID + "\x00" + q.ID
			qa := perQuestion[qkey]
			if qa == nil {
				minC := q.Min
				maxC := q.Max
				qa = &surveyAcc{smin: &minC, smax: &maxC}
				perQuestion[qkey] = qa
			}
			qa.sumNat += v
			qa.nNat++
		}
	}

	upsert := func(row *models.StatisticsSurveyDaily) error {
		return s.statsRepo.UpsertSurveyDaily(row)
	}

	if all.nNorm5 > 0 {
		if err := upsert(&models.StatisticsSurveyDaily{
			UnitID:             unitID,
			BucketDate:         bucketDate,
			SurveyDefinitionID: repository.StatisticsSurveyAggregateSurveyID(),
			QuestionKey:        "",
			SumNorm5:           all.sumNorm5,
			CountNorm5:         all.nNorm5,
		}); err != nil {
			return err
		}
	}
	for sid, a := range perSurvey {
		if a == nil || a.nNorm5 == 0 {
			continue
		}
		if err := upsert(&models.StatisticsSurveyDaily{
			UnitID:             unitID,
			BucketDate:         bucketDate,
			SurveyDefinitionID: sid,
			QuestionKey:        "",
			SumNorm5:           a.sumNorm5,
			CountNorm5:         a.nNorm5,
		}); err != nil {
			return err
		}
	}
	for qkey, a := range perQuestion {
		if a == nil || a.nNat == 0 {
			continue
		}
		parts := strings.SplitN(qkey, "\x00", 2)
		if len(parts) != 2 {
			continue
		}
		surveyID, qid := parts[0], parts[1]
		row := &models.StatisticsSurveyDaily{
			UnitID:             unitID,
			BucketDate:         bucketDate,
			SurveyDefinitionID: surveyID,
			QuestionKey:        qid,
			SumNative:          a.sumNat,
			CountNative:        a.nNat,
			ScaleMin:           a.smin,
			ScaleMax:           a.smax,
		}
		if err := upsert(row); err != nil {
			return err
		}
	}
	return nil
}
