package services

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func ptr(s string) *string { return &s }

func TestServiceAllowedInZone(t *testing.T) {
	zoneA := "zone-a"
	sGlobal := &models.Service{}
	sZoneA := &models.Service{RestrictedServiceZoneID: &zoneA}

	if !ServiceAllowedInZone(sGlobal, "any") {
		t.Fatal("unrestricted service should be allowed in any zone")
	}
	if !ServiceAllowedInZone(sZoneA, "zone-a") {
		t.Fatal("restricted service should match its zone")
	}
	if ServiceAllowedInZone(sZoneA, "zone-b") {
		t.Fatal("restricted service must not match other zone")
	}
	if ServiceAllowedInZone(nil, "z") {
		t.Fatal("nil service is not allowed")
	}
}

func TestServiceAllowedInTicketPool(t *testing.T) {
	zoneA := "zone-a"
	sGlobal := &models.Service{}
	sZoneA := &models.Service{RestrictedServiceZoneID: &zoneA}

	if !ServiceAllowedInTicketPool(sGlobal, nil) {
		t.Fatal("unrestricted service allowed in subdivision-wide pool")
	}
	if !ServiceAllowedInTicketPool(sGlobal, &zoneA) {
		t.Fatal("unrestricted service allowed in zoned pool")
	}
	if ServiceAllowedInTicketPool(sZoneA, nil) {
		t.Fatal("zone-restricted service must not be in subdivision-wide pool")
	}
	if !ServiceAllowedInTicketPool(sZoneA, &zoneA) {
		t.Fatal("zone-restricted service allowed in matching pool")
	}
	if ServiceAllowedInTicketPool(sZoneA, ptr("zone-b")) {
		t.Fatal("zone-restricted service must not match other pool")
	}
}

func TestCounterPoolMatchesTicket(t *testing.T) {
	z := "z1"
	if !CounterPoolMatchesTicket(nil, nil) {
		t.Fatal("nil,nil should match (subdivision-wide)")
	}
	if CounterPoolMatchesTicket(nil, &z) {
		t.Fatal("counter subdivision-wide vs zoned ticket must not match")
	}
	if CounterPoolMatchesTicket(&z, nil) {
		t.Fatal("zoned counter vs subdivision-wide ticket must not match")
	}
	if !CounterPoolMatchesTicket(&z, &z) {
		t.Fatal("same zone id should match")
	}
	if CounterPoolMatchesTicket(ptr("a"), ptr("b")) {
		t.Fatal("different zones must not match")
	}
}
