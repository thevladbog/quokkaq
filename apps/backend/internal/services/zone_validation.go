package services

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// ErrInvalidServiceZone is returned when a unit id is not a direct service_zone child of the subdivision.
var ErrInvalidServiceZone = errors.New("invalid service zone for this unit")

// ValidateChildServiceZone checks zoneID is a direct child service_zone of subdivisionID.
func ValidateChildServiceZone(ur repository.UnitRepository, subdivisionID, zoneID string) error {
	zoneID = strings.TrimSpace(zoneID)
	if zoneID == "" {
		return ErrInvalidServiceZone
	}
	u, err := ur.FindByIDLight(zoneID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrInvalidServiceZone
		}
		return err
	}
	if u.Kind != models.UnitKindServiceZone {
		return ErrInvalidServiceZone
	}
	if u.ParentID == nil || *u.ParentID != subdivisionID {
		return ErrInvalidServiceZone
	}
	return nil
}

// ServiceAllowedInZone is true when the service may be used for tickets waiting in zoneID (non-empty).
func ServiceAllowedInZone(s *models.Service, zoneID string) bool {
	if s == nil {
		return false
	}
	if s.RestrictedServiceZoneID == nil {
		return true
	}
	return *s.RestrictedServiceZoneID == zoneID
}

// ServiceAllowedInTicketPool is true when a ticket in the given pool (nil = subdivision-wide) may use this service.
func ServiceAllowedInTicketPool(s *models.Service, ticketPool *string) bool {
	if s == nil {
		return false
	}
	if s.RestrictedServiceZoneID == nil {
		return true
	}
	if ticketPool == nil {
		return false
	}
	return *s.RestrictedServiceZoneID == *ticketPool
}

// CounterPoolMatchesTicket compares counter and ticket waiting pools (nil = subdivision-wide).
func CounterPoolMatchesTicket(counterPool, ticketPool *string) bool {
	if counterPool == nil && ticketPool == nil {
		return true
	}
	if counterPool == nil || ticketPool == nil {
		return false
	}
	return *counterPool == *ticketPool
}

// ValidateOptionalChildServiceZone validates zoneID when non-nil; nil is allowed (no zone restriction).
func ValidateOptionalChildServiceZone(ur repository.UnitRepository, subdivisionID string, zoneID *string) error {
	if zoneID == nil || strings.TrimSpace(*zoneID) == "" {
		return nil
	}
	return ValidateChildServiceZone(ur, subdivisionID, strings.TrimSpace(*zoneID))
}
