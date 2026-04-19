package services

import (
	"context"
	"errors"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/testsupport"

	"gorm.io/gorm"
)

type testSupportReportRepoList struct {
	list []models.SupportReport
}

func (testSupportReportRepoList) Create(*models.SupportReport) error { return errors.New("unexpected") }

func (testSupportReportRepoList) FindByID(string) (*models.SupportReport, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r testSupportReportRepoList) ListForUser(string, bool) ([]models.SupportReport, error) {
	return r.list, nil
}

func (testSupportReportRepoList) Update(*models.SupportReport) error { return nil }

func (testSupportReportRepoList) DeleteByID(string) error { return nil }

type testSupportReportRepoFind struct {
	row *models.SupportReport
}

func (testSupportReportRepoFind) Create(*models.SupportReport) error { return errors.New("unexpected") }

func (r testSupportReportRepoFind) FindByID(id string) (*models.SupportReport, error) {
	if r.row != nil && r.row.ID == id {
		return r.row, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func (testSupportReportRepoFind) ListForUser(string, bool) ([]models.SupportReport, error) {
	return nil, errors.New("unexpected")
}

func (testSupportReportRepoFind) Update(*models.SupportReport) error { return nil }

func (testSupportReportRepoFind) DeleteByID(string) error { return nil }

type listUserStub struct{ testsupport.PanicUserRepo }

func (listUserStub) IsAdmin(string) (bool, error) { return true, nil }

func TestSupportReportService_List_FiltersByConfiguredPlatform(t *testing.T) {
	repo := testSupportReportRepoList{list: []models.SupportReport{
		{ID: "1", CreatedByUserID: "u", TicketBackend: models.TicketBackendPlane, Title: "plane"},
		{ID: "2", CreatedByUserID: "u", TicketBackend: models.TicketBackendYandexTracker, Title: "yt"},
	}}
	svc := NewSupportReportService(repo, nil, nil, nil, nil, models.TicketBackendYandexTracker, listUserStub{}, nil)
	out, err := svc.List(context.Background(), "u")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0].ID != "2" {
		t.Fatalf("want single yandex_tracker row, got len=%d %#v", len(out), out)
	}
}

func TestSupportReportService_GetByID_WrongPlatform_NotFound(t *testing.T) {
	row := &models.SupportReport{
		ID: "x", CreatedByUserID: "u", TicketBackend: models.TicketBackendPlane, Title: "p",
	}
	repo := testSupportReportRepoFind{row: row}
	svc := NewSupportReportService(repo, nil, nil, nil, nil, models.TicketBackendYandexTracker, listUserStub{}, nil)
	_, err := svc.GetByID(context.Background(), "u", "x")
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
}
