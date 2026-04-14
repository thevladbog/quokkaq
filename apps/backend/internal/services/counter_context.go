package services

import "quokkaq-go-backend/internal/models"

// CounterMatchesOrgUnit validates that a counter is visible under the selected subdivision or service_zone (pairing wizard context).
func CounterMatchesOrgUnit(counter *models.Counter, contextUnit *models.Unit) bool {
	if counter == nil || contextUnit == nil {
		return false
	}
	switch contextUnit.Kind {
	case models.UnitKindSubdivision:
		return counter.UnitID == contextUnit.ID
	case models.UnitKindServiceZone:
		if contextUnit.ParentID == nil || *contextUnit.ParentID == "" {
			return false
		}
		if counter.UnitID != *contextUnit.ParentID {
			return false
		}
		if counter.ServiceZoneID == nil || *counter.ServiceZoneID == "" {
			return true
		}
		return *counter.ServiceZoneID == contextUnit.ID
	default:
		return false
	}
}
