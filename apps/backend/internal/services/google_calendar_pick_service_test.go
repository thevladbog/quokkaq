package services

import (
	"context"
	"errors"
	"net"
	"os"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/sso/redisstore"
	"quokkaq-go-backend/pkg/database"

	"github.com/alicebob/miniredis/v2"
)

func setupGooglePickRedis(t *testing.T) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		mr.Close()
		redisstore.ResetClientForTest()
	})
	host, port, err := net.SplitHostPort(mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	prevHost, prevPort, prevDis := os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT"), os.Getenv("SSO_REDIS_DISABLED")
	t.Cleanup(func() {
		restore := func(k, v string) {
			if v == "" {
				_ = os.Unsetenv(k)
			} else {
				_ = os.Setenv(k, v)
			}
		}
		restore("REDIS_HOST", prevHost)
		restore("REDIS_PORT", prevPort)
		restore("SSO_REDIS_DISABLED", prevDis)
	})
	_ = os.Setenv("REDIS_HOST", host)
	_ = os.Setenv("REDIS_PORT", port)
	_ = os.Setenv("SSO_REDIS_DISABLED", "false")
	redisstore.ResetClientForTest()
}

func TestListGooglePickCalendars_invalidPickToken(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	setupGooglePickRedis(t)
	svc := newTestCalendarService()
	ctx := context.Background()
	_, err := svc.ListGooglePickCalendars(ctx, "co", "")
	if !errors.Is(err, ErrGoogleCalendarPickInvalid) {
		t.Fatalf("want ErrGoogleCalendarPickInvalid, got %v", err)
	}
}

func TestListGooglePickCalendars_companyMismatch(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	setupGooglePickRedis(t)
	if err := database.DB.Create(&models.Unit{
		ID:        "unit-pick-a",
		CompanyID: "co-a",
		Code:      "pa",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pickTok := "picktokmismatch"
	pay := GoogleCalendarPickPayload{
		CompanyID:    "co-a",
		UnitID:       "unit-pick-a",
		ReturnPath:   "/settings/integrations",
		RefreshToken: "refresh-x",
		Email:        "user@gmail.com",
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickTok), pay, time.Minute); err != nil {
		t.Fatal(err)
	}
	svc := newTestCalendarService()
	_, err := svc.ListGooglePickCalendars(ctx, "co-b", pickTok)
	if !errors.Is(err, ErrCalendarUnitCompanyMismatch) {
		t.Fatalf("want ErrCalendarUnitCompanyMismatch, got %v", err)
	}
}

func TestListGooglePickCalendars_oauthNotConfiguredAfterRedisOK(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	setupGooglePickRedis(t)
	if err := database.DB.Create(&models.Unit{
		ID:        "unit-pick-b",
		CompanyID: "co-b",
		Code:      "pb",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pickTok := "picktoklist"
	pay := GoogleCalendarPickPayload{
		CompanyID:    "co-b",
		UnitID:       "unit-pick-b",
		ReturnPath:   "/settings/integrations",
		RefreshToken: "refresh-x",
		Email:        "user@gmail.com",
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickTok), pay, time.Minute); err != nil {
		t.Fatal(err)
	}
	svc := newTestCalendarService()
	_, err := svc.ListGooglePickCalendars(ctx, "co-b", pickTok)
	if !errors.Is(err, ErrGoogleCalendarOAuthNotConfigured) {
		t.Fatalf("want ErrGoogleCalendarOAuthNotConfigured, got %v", err)
	}
}

func TestCompleteGoogleCalendarPick_invalidToken(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	setupGooglePickRedis(t)
	svc := newTestCalendarService()
	ctx := context.Background()
	_, err := svc.CompleteGoogleCalendarPick(ctx, "co", "nope", "cal@gmail.com")
	if !errors.Is(err, ErrGoogleCalendarPickInvalid) {
		t.Fatalf("want ErrGoogleCalendarPickInvalid, got %v", err)
	}
}

func TestCompleteGoogleCalendarPick_secondCallInvalidatesSession(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	setupGooglePickRedis(t)
	if err := database.DB.Create(&models.Unit{
		ID:        "unit-pick-c",
		CompanyID: "co-c",
		Code:      "pc",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pickTok := "picktokcomplete"
	calID := "room@group.calendar.google.com"
	pay := GoogleCalendarPickPayload{
		CompanyID:    "co-c",
		UnitID:       "unit-pick-c",
		ReturnPath:   "/settings/integrations",
		RefreshToken: "refresh-abc",
		Email:        "owner@gmail.com",
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickTok), pay, time.Minute); err != nil {
		t.Fatal(err)
	}
	svc := newTestCalendarService()
	pub, err := svc.CompleteGoogleCalendarPick(ctx, "co-c", pickTok, calID)
	if err != nil {
		t.Fatal(err)
	}
	wantPath := models.GoogleCalDAVEventsCollectionPath(calID)
	if pub.CalendarPath != wantPath {
		t.Fatalf("calendar path %q want %q", pub.CalendarPath, wantPath)
	}
	_, err2 := svc.CompleteGoogleCalendarPick(ctx, "co-c", pickTok, calID)
	if !errors.Is(err2, ErrGoogleCalendarPickInvalid) {
		t.Fatalf("second complete: want ErrGoogleCalendarPickInvalid, got %v", err2)
	}
}
