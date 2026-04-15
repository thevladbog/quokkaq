package services

// statisticsRollupSelect returns SQL and args for daily aggregates over tickets in a subdivision,
// optionally restricted to one service_zone_id (non-empty zoneID) or all zones (empty zoneID).
func statisticsRollupSelect(unitID string, zoneID string, startUTC, endUTC interface{}) (string, []interface{}) {
	var z1, z2 interface{}
	if zoneID == "" {
		z1, z2 = nil, nil
	} else {
		z1, z2 = zoneID, zoneID
	}
	q := `
WITH scoped AS (
  SELECT * FROM tickets
  WHERE unit_id = ?
    AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
)
SELECT
  (SELECT COUNT(*) FROM scoped WHERE created_at >= ? AND created_at < ?) AS tickets_created,
  (SELECT COUNT(*) FROM scoped WHERE completed_at >= ? AND completed_at < ? AND status IN ('served','no_show','cancelled','completed')) AS tickets_completed,
  (SELECT COUNT(*) FROM scoped WHERE completed_at >= ? AND completed_at < ? AND status = 'no_show') AS no_show_count,
  COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (called_at - created_at)) * 1000)::bigint FROM scoped WHERE called_at IS NOT NULL AND called_at >= ? AND called_at < ?), 0) AS wait_sum_ms,
  (SELECT COUNT(*) FROM scoped WHERE called_at IS NOT NULL AND called_at >= ? AND called_at < ?) AS wait_count,
  COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (completed_at - confirmed_at)) * 1000)::bigint FROM scoped WHERE status = 'served' AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?), 0) AS service_sum_ms,
  (SELECT COUNT(*) FROM scoped WHERE status = 'served' AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?) AS service_count,
  (SELECT COUNT(*) FROM scoped WHERE called_at IS NOT NULL AND called_at >= ? AND called_at < ? AND max_waiting_time IS NOT NULL
     AND EXTRACT(EPOCH FROM (called_at - created_at)) <= max_waiting_time) AS sla_wait_met,
  (SELECT COUNT(*) FROM scoped WHERE called_at IS NOT NULL AND called_at >= ? AND called_at < ? AND max_waiting_time IS NOT NULL) AS sla_wait_total
`
	// 3 (CTE) + 9×2 date-range pairs in the outer SELECT subqueries = 21 args.
	args := []interface{}{
		unitID, z1, z2,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
		startUTC, endUTC,
	}
	return q, args
}
