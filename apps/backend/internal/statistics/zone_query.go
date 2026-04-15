package statistics

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// VerifyServiceZoneUnderSubdivision checks zoneID is a direct child service_zone of subdivisionID.
func VerifyServiceZoneUnderSubdivision(db *gorm.DB, subdivisionID, zoneID string) error {
	var cnt int64
	// units.id / parent_id are text in this schema; do not cast bind params to uuid (text = uuid errors).
	if err := db.Raw(`
SELECT COUNT(*) FROM units
WHERE id = ? AND parent_id = ? AND kind = 'service_zone'
`, zoneID, subdivisionID).Scan(&cnt).Error; err != nil {
		return err
	}
	if cnt == 0 {
		return fmt.Errorf("service zone not under subdivision")
	}
	return nil
}

// ResolveDailyBucketZoneQuery maps viewer scope and optional explicit zone to warehouse rows.
func ResolveDailyBucketZoneQuery(db *gorm.DB, subdivisionID string, sc Scope, requestedServiceZoneID string) (repository.StatisticsZoneQuery, error) {
	req := strings.TrimSpace(requestedServiceZoneID)
	if req != "" {
		if err := VerifyServiceZoneUnderSubdivision(db, subdivisionID, req); err != nil {
			return repository.StatisticsZoneQuery{}, err
		}
		if len(sc.AllowedZoneIDs) > 0 {
			if _, ok := sc.AllowedZoneIDs[req]; !ok {
				return repository.StatisticsZoneQuery{}, errors.New("forbidden service zone")
			}
		}
		return repository.StatisticsZoneQuery{ZoneIDs: []string{req}}, nil
	}
	if len(sc.AllowedZoneIDs) > 0 {
		ids := make([]string, 0, len(sc.AllowedZoneIDs))
		for id := range sc.AllowedZoneIDs {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			ids = append(ids, id)
		}
		if len(ids) == 0 {
			return repository.StatisticsZoneQuery{WholeSubdivision: true}, nil
		}
		sort.Strings(ids)
		return repository.StatisticsZoneQuery{ZoneIDs: ids}, nil
	}
	return repository.StatisticsZoneQuery{WholeSubdivision: true}, nil
}
