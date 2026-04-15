package models

import "time"

// StatisticsSurveyDaily is pre-aggregated guest survey scores per subdivision calendar day.
// SurveyDefinitionID = StatisticsSurveyAggregateSurveyID and QuestionKey "" = all surveys combined (norm 1..5).
// QuestionKey non-empty = native-scale bucket for that question.
type StatisticsSurveyDaily struct {
	ID                 string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID             string `gorm:"type:uuid;not null;uniqueIndex:uniq_stat_survey_daily,priority:1" json:"unitId"`
	BucketDate         string `gorm:"type:date;not null;uniqueIndex:uniq_stat_survey_daily,priority:2" json:"bucketDate"`
	SurveyDefinitionID string `gorm:"type:uuid;not null;uniqueIndex:uniq_stat_survey_daily,priority:3" json:"surveyDefinitionId"`
	QuestionKey        string `gorm:"type:text;not null;default:'';uniqueIndex:uniq_stat_survey_daily,priority:4" json:"questionKey"`

	SumNorm5   float64 `gorm:"not null;default:0" json:"-"`
	CountNorm5 int     `gorm:"not null;default:0" json:"-"`

	SumNative   float64  `gorm:"not null;default:0" json:"-"`
	CountNative int      `gorm:"not null;default:0" json:"-"`
	ScaleMin    *float64 `json:"scaleMin,omitempty"`
	ScaleMax    *float64 `json:"scaleMax,omitempty"`

	ComputedAt time.Time `gorm:"not null" json:"computedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (StatisticsSurveyDaily) TableName() string {
	return "statistics_survey_daily"
}
