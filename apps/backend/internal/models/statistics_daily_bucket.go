package models

import "time"

// StatisticsDailyBucket stores pre-aggregated daily metrics per subdivision (and optional actor).
// ServiceZoneID is StatisticsWholeSubdivisionServiceZoneID for a roll-up across all zones; otherwise a service_zone unit id.
type StatisticsDailyBucket struct {
	ID string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`

	UnitID     string `gorm:"type:uuid;not null;uniqueIndex:uniq_stat_daily_svcz,priority:1" json:"unitId"`
	BucketDate string `gorm:"type:date;not null;uniqueIndex:uniq_stat_daily_svcz,priority:2" json:"bucketDate"` // YYYY-MM-DD in unit TZ
	// ActorUserID all-zero UUID means aggregate for whole unit (not a specific operator).
	ActorUserID   string `gorm:"type:uuid;not null;uniqueIndex:uniq_stat_daily_svcz,priority:3;default:00000000-0000-0000-0000-000000000000" json:"actorUserId"`
	ServiceZoneID string `gorm:"type:uuid;not null;uniqueIndex:uniq_stat_daily_svcz,priority:4;default:00000000-0000-0000-0000-000000000000" json:"serviceZoneId"`

	WaitSumMs    int64 `gorm:"not null;default:0" json:"-"`
	WaitCount    int   `gorm:"not null;default:0" json:"-"`
	ServiceSumMs int64 `gorm:"not null;default:0" json:"-"`
	ServiceCount int   `gorm:"not null;default:0" json:"-"`

	TicketsCreated   int `gorm:"not null;default:0" json:"ticketsCreated"`
	TicketsCompleted int `gorm:"not null;default:0" json:"ticketsCompleted"`
	NoShowCount      int `gorm:"not null;default:0" json:"noShowCount"`

	SlaWaitMet   int `gorm:"not null;default:0" json:"slaWaitMet"`
	SlaWaitTotal int `gorm:"not null;default:0" json:"slaWaitTotal"`

	SlaServiceMet   int `gorm:"not null;default:0" json:"slaServiceMet"`
	SlaServiceTotal int `gorm:"not null;default:0" json:"slaServiceTotal"`

	ComputedAt time.Time `gorm:"not null" json:"computedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (StatisticsDailyBucket) TableName() string {
	return "statistics_daily_buckets"
}
