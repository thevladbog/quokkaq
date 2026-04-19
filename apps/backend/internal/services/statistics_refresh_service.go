package services

import (
	"context"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/logger"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// StatisticsRefreshService rolls up ticket data into statistics_daily_buckets.
type StatisticsRefreshService struct {
	db           *gorm.DB
	statsRepo    repository.StatisticsRepository
	unitRepo     repository.UnitRepository
	opRepo       repository.OperationalStateRepository
	segmentsRepo repository.StatisticsTicketSegmentsRepository
}

func NewStatisticsRefreshService(
	statsRepo repository.StatisticsRepository,
	unitRepo repository.UnitRepository,
	opRepo repository.OperationalStateRepository,
	segmentsRepo repository.StatisticsTicketSegmentsRepository,
) *StatisticsRefreshService {
	return &StatisticsRefreshService{
		db:           database.DB,
		statsRepo:    statsRepo,
		unitRepo:     unitRepo,
		opRepo:       opRepo,
		segmentsRepo: segmentsRepo,
	}
}

// RollupUnitDay recomputes buckets for a calendar day in the unit's timezone (YYYY-MM-DD).
//
// Waiting time and waiting SLA use the queue segment after the last ticket.transferred strictly before
// the qualifying call (see statistics_wait_segments). Service time uses summed in_service segments from
// ticket_histories: each segment starts at ticket.status_changed → in_service and ends at the next
// ticket.transferred, ticket.returned_to_queue, ticket.recalled, terminal status_changed (served/no_show),
// or completed_at for a served ticket. service_count is the number of such segments with positive duration
// (not the number of tickets). Per-operator service sums only segments whose in_service row carries that user_id.
func (s *StatisticsRefreshService) RollupUnitDay(unitID, bucketDate string) error {
	u, err := s.unitRepo.FindByID(unitID)
	if err != nil {
		return err
	}
	if u.Kind != models.UnitKindSubdivision {
		return fmt.Errorf("statistics rollup expects subdivision unit id")
	}
	loc, err := time.LoadLocation(strings.TrimSpace(u.Timezone))
	if err != nil || loc == nil {
		loc = time.UTC
	}
	t, err := time.ParseInLocation("2006-01-02", bucketDate, loc)
	if err != nil {
		return fmt.Errorf("bucket date: %w", err)
	}
	start := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	// Next calendar midnight in loc (DST-safe); not a fixed 24h offset.
	end := start.AddDate(0, 0, 1)
	startUTC := start.UTC()
	endUTC := end.UTC()

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		statsTx := repository.NewStatisticsRepositoryWithDB(tx)
		segTx := repository.NewStatisticsTicketSegmentsRepositoryWithDB(tx)
		if err := statsTx.DeleteDailyBucketsForUnitDay(unitID, bucketDate); err != nil {
			return err
		}

		type aggRow struct {
			TicketsCreated   int64
			TicketsCompleted int64
			NoShowCount      int64
			WaitSumMs        int64
			WaitCount        int64
			ServiceSumMs     int64
			ServiceCount     int64
			SlaWaitMet       int64
			SlaWaitTotal     int64
		}

		rollup := func(zoneFilter string) (aggRow, error) {
			var row aggRow
			q, args := statisticsRollupSelect(unitID, zoneFilter, startUTC, endUTC)
			if err := tx.Raw(q, args...).Scan(&row).Error; err != nil {
				return row, err
			}
			ws, wc, sm, st, err := computeWaitSLAForTicketsCalledInRange(segTx, unitID, startUTC, endUTC, zoneFilter)
			if err != nil {
				return row, err
			}
			row.WaitSumMs = ws
			row.WaitCount = int64(wc)
			row.SlaWaitMet = int64(sm)
			row.SlaWaitTotal = int64(st)
			ssum, scnt, err := aggregateServiceTimeForServedTicketsCompletedInRange(segTx, unitID, zoneFilter, startUTC, endUTC)
			if err != nil {
				return row, err
			}
			row.ServiceSumMs = ssum
			row.ServiceCount = int64(scnt)
			return row, nil
		}

		row, err := rollup("")
		if err != nil {
			return err
		}
		bucket := models.StatisticsDailyBucket{
			UnitID:           unitID,
			BucketDate:       bucketDate,
			ActorUserID:      repository.StatisticsUnitAggregateActor(),
			ServiceZoneID:    repository.StatisticsWholeSubdivisionServiceZoneID(),
			WaitSumMs:        row.WaitSumMs,
			WaitCount:        int(row.WaitCount),
			ServiceSumMs:     row.ServiceSumMs,
			ServiceCount:     int(row.ServiceCount),
			TicketsCreated:   int(row.TicketsCreated),
			TicketsCompleted: int(row.TicketsCompleted),
			NoShowCount:      int(row.NoShowCount),
			SlaWaitMet:       int(row.SlaWaitMet),
			SlaWaitTotal:     int(row.SlaWaitTotal),
		}
		if err := statsTx.UpsertDailyBucket(&bucket); err != nil {
			return err
		}

		type zid struct{ ServiceZoneID string }
		var zoneIDs []zid
		zq := `
SELECT DISTINCT service_zone_id::text AS service_zone_id
FROM tickets
WHERE unit_id = ?
  AND service_zone_id IS NOT NULL
  AND (
    (created_at >= ? AND created_at < ?)
    OR (completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?)
    OR (called_at IS NOT NULL AND called_at >= ? AND called_at < ?)
  )
`
		if err := tx.Raw(zq, unitID, startUTC, endUTC, startUTC, endUTC, startUTC, endUTC).Scan(&zoneIDs).Error; err != nil {
			return err
		}
		for _, z := range zoneIDs {
			zs := strings.TrimSpace(z.ServiceZoneID)
			if zs == "" {
				continue
			}
			zr, err := rollup(zs)
			if err != nil {
				return err
			}
			zb := models.StatisticsDailyBucket{
				UnitID:           unitID,
				BucketDate:       bucketDate,
				ActorUserID:      repository.StatisticsUnitAggregateActor(),
				ServiceZoneID:    zs,
				WaitSumMs:        zr.WaitSumMs,
				WaitCount:        int(zr.WaitCount),
				ServiceSumMs:     zr.ServiceSumMs,
				ServiceCount:     int(zr.ServiceCount),
				TicketsCreated:   int(zr.TicketsCreated),
				TicketsCompleted: int(zr.TicketsCompleted),
				NoShowCount:      int(zr.NoShowCount),
				SlaWaitMet:       int(zr.SlaWaitMet),
				SlaWaitTotal:     int(zr.SlaWaitTotal),
			}
			if err := statsTx.UpsertDailyBucket(&zb); err != nil {
				return err
			}
		}

		type uidRow struct {
			UserID string
		}
		var uids []uidRow
		if err := tx.Raw(`
SELECT DISTINCT h.user_id::text AS user_id
FROM ticket_histories h
INNER JOIN tickets t ON t.id = h.ticket_id
WHERE t.unit_id = ?
  AND h.user_id IS NOT NULL
  AND h.action = 'ticket.status_changed'
  AND h.created_at >= ? AND h.created_at < ?
`, unitID, startUTC, endUTC).Scan(&uids).Error; err != nil {
			return err
		}

		for _, ur := range uids {
			if strings.TrimSpace(ur.UserID) == "" {
				continue
			}
			var pr aggRow
			pq := `
WITH touched AS (
  SELECT DISTINCT h.ticket_id
  FROM ticket_histories h
  INNER JOIN tickets t ON t.id = h.ticket_id
  WHERE t.unit_id = ? AND h.user_id = ?
    AND h.created_at >= ? AND h.created_at < ?
)
SELECT
  0 AS tickets_created,
  (SELECT COUNT(*) FROM tickets t INNER JOIN touched x ON x.ticket_id = t.id
    WHERE t.completed_at >= ? AND t.completed_at < ? AND t.status IN ('served','no_show','cancelled','completed')) AS tickets_completed,
  (SELECT COUNT(*) FROM tickets t INNER JOIN touched x ON x.ticket_id = t.id
    WHERE t.completed_at >= ? AND t.completed_at < ? AND t.status = 'no_show') AS no_show_count,
  0 AS wait_sum_ms,
  0 AS wait_count,
  COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (t.completed_at - t.confirmed_at)) * 1000)::bigint FROM tickets t INNER JOIN touched x ON x.ticket_id = t.id
    WHERE t.status = 'served' AND t.confirmed_at IS NOT NULL AND t.completed_at IS NOT NULL AND t.completed_at >= ? AND t.completed_at < ?), 0) AS service_sum_ms,
  (SELECT COUNT(*) FROM tickets t INNER JOIN touched x ON x.ticket_id = t.id
    WHERE t.status = 'served' AND t.confirmed_at IS NOT NULL AND t.completed_at IS NOT NULL AND t.completed_at >= ? AND t.completed_at < ?) AS service_count,
  0 AS sla_wait_met,
  0 AS sla_wait_total
`
			if err := tx.Raw(pq,
				unitID, ur.UserID, startUTC, endUTC,
				startUTC, endUTC,
				startUTC, endUTC,
				startUTC, endUTC,
				startUTC, endUTC,
			).Scan(&pr).Error; err != nil {
				return err
			}
			var touchedIDs []string
			if err := tx.Raw(`
SELECT DISTINCT h.ticket_id::text
FROM ticket_histories h
INNER JOIN tickets t ON t.id = h.ticket_id
WHERE t.unit_id = ? AND h.user_id = ?
  AND h.created_at >= ? AND h.created_at < ?
`, unitID, ur.UserID, startUTC, endUTC).Scan(&touchedIDs).Error; err != nil {
				return err
			}
			opTicketMap, err := segTx.BatchTicketsByIDs(touchedIDs)
			if err != nil {
				return err
			}
			opHistMap, err := segTx.BatchHistoriesByTicketIDs(touchedIDs)
			if err != nil {
				return err
			}
			opSSum, opSCnt := aggregateServiceTimeForOperatorOnTouchedTicketsPreloaded(
				ur.UserID,
				touchedIDs,
				opTicketMap,
				opHistMap,
			)
			pr.ServiceSumMs = opSSum
			pr.ServiceCount = int64(opSCnt)
			var wSum int64
			var wN, slaM, slaT int
			for _, tid := range touchedIDs {
				t, ok := opTicketMap[tid]
				if !ok {
					continue
				}
				if t.CalledAt != nil {
					ca := *t.CalledAt
					if ca.Before(startUTC) || !ca.Before(endUTC) {
						continue
					}
					ws, wc, sm, st := waitSLAMetricsCalledTicketData(t, opHistMap[tid])
					wSum += ws
					wN += wc
					slaM += sm
					slaT += st
					continue
				}
				if t.CompletedAt == nil ||
					t.CompletedAt.Before(startUTC) ||
					!t.CompletedAt.Before(endUTC) {
					continue
				}
				ws, wc, sm, st := waitSLAMetricsNoCallClosureData(t, opHistMap[tid])
				wSum += ws
				wN += wc
				slaM += sm
				slaT += st
			}
			pr.WaitSumMs = wSum
			pr.WaitCount = int64(wN)
			pr.SlaWaitMet = int64(slaM)
			pr.SlaWaitTotal = int64(slaT)
			ub := models.StatisticsDailyBucket{
				UnitID:           unitID,
				BucketDate:       bucketDate,
				ActorUserID:      ur.UserID,
				ServiceZoneID:    repository.StatisticsWholeSubdivisionServiceZoneID(),
				WaitSumMs:        pr.WaitSumMs,
				WaitCount:        int(pr.WaitCount),
				ServiceSumMs:     pr.ServiceSumMs,
				ServiceCount:     int(pr.ServiceCount),
				TicketsCreated:   int(pr.TicketsCreated),
				TicketsCompleted: int(pr.TicketsCompleted),
				NoShowCount:      int(pr.NoShowCount),
				SlaWaitMet:       int(pr.SlaWaitMet),
				SlaWaitTotal:     int(pr.SlaWaitTotal),
			}
			if err := statsTx.UpsertDailyBucket(&ub); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}

	// Survey daily buckets and StatisticsAsOf run after the ticket bucket transaction commits.
	// RollupUnitDay is safe to re-run: bucket rows are deleted and rebuilt; survey rollup and Upsert are idempotent for a given day.
	if err := s.rollupSurveyDay(unitID, bucketDate, startUTC, endUTC); err != nil {
		return err
	}

	now := time.Now().UTC()
	st, err := s.opRepo.Get(unitID)
	if err != nil {
		return err
	}
	if st == nil {
		st = &models.UnitOperationalState{UnitID: unitID, Phase: "idle"}
	}
	st.StatisticsAsOf = &now
	return s.opRepo.Upsert(st)
}

// RefreshRecentDays rolls up yesterday and today for all subdivisions.
func (s *StatisticsRefreshService) RefreshRecentDays() {
	var units []models.Unit
	if err := s.db.Where("kind = ?", models.UnitKindSubdivision).Find(&units).Error; err != nil {
		logger.Printf("statistics refresh: list units: %v", err)
		return
	}
	for i := range units {
		u := units[i]
		loc, err := time.LoadLocation(strings.TrimSpace(u.Timezone))
		if err != nil || loc == nil {
			loc = time.UTC
		}
		now := time.Now().In(loc)
		for d := 0; d >= -1; d-- {
			day := now.AddDate(0, 0, d).Format("2006-01-02")
			if err := s.RollupUnitDay(u.ID, day); err != nil {
				logger.Printf("statistics refresh unit=%s day=%s: %v", u.ID, day, err)
			}
		}
	}
}

// StartPeriodicRefresh runs RefreshRecentDays on an interval (default 5m, env STATISTICS_REFRESH_INTERVAL_SEC).
// The goroutine exits when ctx is cancelled (e.g. API shutdown).
func (s *StatisticsRefreshService) StartPeriodicRefresh(ctx context.Context) {
	sec := 300
	if v := strings.TrimSpace(os.Getenv("STATISTICS_REFRESH_INTERVAL_SEC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			sec = n
		}
	}
	d := time.Duration(sec) * time.Second
	go func() {
		t := time.NewTicker(d)
		defer t.Stop()
		s.RefreshRecentDays()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.RefreshRecentDays()
			}
		}
	}()
}
