package repository

import (
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StatisticsZoneQuery selects which service_zone rows to read (pre-aggregated buckets).
// WholeSubdivision: only the synthetic row where service_zone_id = whole-subdivision sentinel.
// ZoneIDs: one or more real service zone unit ids; multiple IDs are merged per day (SUM).
type StatisticsZoneQuery struct {
	WholeSubdivision bool
	ZoneIDs          []string
}

type StatisticsRepository interface {
	UpsertDailyBucket(bucket *models.StatisticsDailyBucket) error
	ListDailyBuckets(unitID, dateFrom, dateTo string, actorUserID *string, zoneQ StatisticsZoneQuery) ([]models.StatisticsDailyBucket, error)
	DeleteDailyBucketsForUnitDay(unitID, bucketDate string) error

	UpsertSurveyDaily(row *models.StatisticsSurveyDaily) error
	DeleteSurveyDailyForUnitDay(unitID, bucketDate string) error
	ListSurveyDaily(unitID, dateFrom, dateTo string) ([]models.StatisticsSurveyDaily, error)
}

type statisticsRepository struct {
	db *gorm.DB
}

func NewStatisticsRepository() StatisticsRepository {
	return &statisticsRepository{db: database.DB}
}

func (r *statisticsRepository) UpsertDailyBucket(bucket *models.StatisticsDailyBucket) error {
	if bucket.UnitID == "" || bucket.BucketDate == "" {
		return errors.New("unit and bucket date required")
	}
	if strings.TrimSpace(bucket.ServiceZoneID) == "" {
		bucket.ServiceZoneID = statisticsWholeSubdivisionServiceZone
	}
	bucket.ComputedAt = time.Now().UTC()
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "unit_id"},
			{Name: "bucket_date"},
			{Name: "actor_user_id"},
			{Name: "service_zone_id"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"wait_sum_ms", "wait_count", "service_sum_ms", "service_count",
			"tickets_created", "tickets_completed", "no_show_count",
			"sla_wait_met", "sla_wait_total", "computed_at",
		}),
	}).Create(bucket).Error
}

const statisticsUnitAggregateActor = "00000000-0000-0000-0000-000000000000"

// statisticsWholeSubdivisionServiceZone is stored in service_zone_id when the bucket aggregates all service zones.
const statisticsWholeSubdivisionServiceZone = "00000000-0000-0000-0000-000000000000"

func StatisticsUnitAggregateActor() string { return statisticsUnitAggregateActor }

// StatisticsWholeSubdivisionServiceZoneID is the service_zone_id value for subdivision-wide aggregates.
func StatisticsWholeSubdivisionServiceZoneID() string { return statisticsWholeSubdivisionServiceZone }

func (r *statisticsRepository) ListDailyBuckets(unitID, dateFrom, dateTo string, actorUserID *string, zoneQ StatisticsZoneQuery) ([]models.StatisticsDailyBucket, error) {
	actor := statisticsUnitAggregateActor
	if actorUserID != nil {
		actor = *actorUserID
	}
	// Per-operator rows are stored only with whole-subdivision service_zone_id.
	if actorUserID != nil {
		zoneQ = StatisticsZoneQuery{WholeSubdivision: true}
	}

	if zoneQ.WholeSubdivision {
		var rows []models.StatisticsDailyBucket
		// Cast id columns to text so reads work whether DB columns are uuid or text (legacy units/tickets ids).
		err := r.db.Where(
			"unit_id::text = ? AND bucket_date >= ? AND bucket_date <= ? AND actor_user_id::text = ? AND service_zone_id::text = ?",
			unitID, dateFrom, dateTo, actor, statisticsWholeSubdivisionServiceZone,
		).Order("bucket_date ASC").Find(&rows).Error
		return rows, err
	}

	if len(zoneQ.ZoneIDs) == 0 {
		return nil, errors.New("statistics: empty zone filter")
	}

	if len(zoneQ.ZoneIDs) == 1 {
		var rows []models.StatisticsDailyBucket
		err := r.db.Where(
			"unit_id::text = ? AND bucket_date >= ? AND bucket_date <= ? AND actor_user_id::text = ? AND service_zone_id::text = ?",
			unitID, dateFrom, dateTo, actor, zoneQ.ZoneIDs[0],
		).Order("bucket_date ASC").Find(&rows).Error
		return rows, err
	}

	type merged struct {
		BucketDate       string    `gorm:"column:bucket_date"`
		WaitSumMs        int64     `gorm:"column:wait_sum_ms"`
		WaitCount        int64     `gorm:"column:wait_count"`
		ServiceSumMs     int64     `gorm:"column:service_sum_ms"`
		ServiceCount     int64     `gorm:"column:service_count"`
		TicketsCreated   int64     `gorm:"column:tickets_created"`
		TicketsCompleted int64     `gorm:"column:tickets_completed"`
		NoShowCount      int64     `gorm:"column:no_show_count"`
		SlaWaitMet       int64     `gorm:"column:sla_wait_met"`
		SlaWaitTotal     int64     `gorm:"column:sla_wait_total"`
		ComputedAt       time.Time `gorm:"column:computed_at"`
	}
	var mergedRows []merged
	err := r.db.Model(&models.StatisticsDailyBucket{}).
		Select(`bucket_date,
			SUM(wait_sum_ms) AS wait_sum_ms,
			SUM(wait_count) AS wait_count,
			SUM(service_sum_ms) AS service_sum_ms,
			SUM(service_count) AS service_count,
			SUM(tickets_created) AS tickets_created,
			SUM(tickets_completed) AS tickets_completed,
			SUM(no_show_count) AS no_show_count,
			SUM(sla_wait_met) AS sla_wait_met,
			SUM(sla_wait_total) AS sla_wait_total,
			MAX(computed_at) AS computed_at`).
		Where("unit_id::text = ? AND bucket_date >= ? AND bucket_date <= ? AND actor_user_id::text = ? AND service_zone_id::text IN ?",
			unitID, dateFrom, dateTo, actor, zoneQ.ZoneIDs).
		Group("bucket_date").
		Order("bucket_date ASC").
		Scan(&mergedRows).Error
	if err != nil {
		return nil, err
	}
	out := make([]models.StatisticsDailyBucket, 0, len(mergedRows))
	for _, m := range mergedRows {
		out = append(out, models.StatisticsDailyBucket{
			UnitID:           unitID,
			BucketDate:       m.BucketDate,
			ActorUserID:      actor,
			ServiceZoneID:    statisticsWholeSubdivisionServiceZone,
			WaitSumMs:        m.WaitSumMs,
			WaitCount:        int(m.WaitCount),
			ServiceSumMs:     m.ServiceSumMs,
			ServiceCount:     int(m.ServiceCount),
			TicketsCreated:   int(m.TicketsCreated),
			TicketsCompleted: int(m.TicketsCompleted),
			NoShowCount:      int(m.NoShowCount),
			SlaWaitMet:       int(m.SlaWaitMet),
			SlaWaitTotal:     int(m.SlaWaitTotal),
			ComputedAt:       m.ComputedAt,
		})
	}
	return out, nil
}

func (r *statisticsRepository) DeleteDailyBucketsForUnitDay(unitID, bucketDate string) error {
	return r.db.Where("unit_id = ? AND bucket_date = ?", unitID, bucketDate).Delete(&models.StatisticsDailyBucket{}).Error
}

// StatisticsSurveyAggregateSurveyID is stored as survey_definition_id for the combined “all surveys” norm-5 row.
func StatisticsSurveyAggregateSurveyID() string {
	return "00000000-0000-0000-0000-000000000000"
}

func (r *statisticsRepository) UpsertSurveyDaily(row *models.StatisticsSurveyDaily) error {
	if row.UnitID == "" || row.BucketDate == "" {
		return errors.New("survey daily: unit and date required")
	}
	row.ComputedAt = time.Now().UTC()
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "unit_id"},
			{Name: "bucket_date"},
			{Name: "survey_definition_id"},
			{Name: "question_key"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"sum_norm5", "count_norm5", "sum_native", "count_native", "scale_min", "scale_max", "computed_at",
		}),
	}).Create(row).Error
}

func (r *statisticsRepository) DeleteSurveyDailyForUnitDay(unitID, bucketDate string) error {
	return r.db.Where("unit_id = ? AND bucket_date = ?", unitID, bucketDate).Delete(&models.StatisticsSurveyDaily{}).Error
}

func (r *statisticsRepository) ListSurveyDaily(unitID, dateFrom, dateTo string) ([]models.StatisticsSurveyDaily, error) {
	var rows []models.StatisticsSurveyDaily
	err := r.db.Where("unit_id::text = ? AND bucket_date >= ? AND bucket_date <= ?", unitID, dateFrom, dateTo).
		Order("bucket_date ASC, survey_definition_id, question_key").
		Find(&rows).Error
	return rows, err
}
