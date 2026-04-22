package services

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// predictionTestDB creates an empty companies table so loadCompanyPlanFeaturesJSON returns
// sql.ErrNoRows and CompanyAllowsAdvancedReports treats the tenant as legacy-allowed.
func predictionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE companies (id text PRIMARY KEY);`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

// TestMaybeBroadcastStaffingAlert_heuristicHighWait ensures the heuristic staffing path runs
// without blocking the WebSocket hub (hub.Run consumes broadcast messages).
func TestMaybeBroadcastStaffingAlert_heuristicHighWait(t *testing.T) {
	t.Parallel()
	db := predictionTestDB(t)
	hub := ws.NewHub()
	t.Cleanup(hub.Stop)
	go hub.Run()

	unitID := "u1"
	// ~20 min aggregate wait, 1 counter → heuristic: wait >= 12 and counters < 4.
	ticketRepo := &etaTicketRepo{
		waitingByUnit: 20,
		recentTimes:   map[string][]int{unitID + "|": {60, 60, 60, 60, 60}},
	}
	// statsRepo bucket fallback so queue ETA is non-zero without full ticket history (heuristic needs wait >= 12 min).
	statsRepo := &etaStatsRepoStub{avgSec: 120, ok: true}
	eta := NewETAServiceFull(ticketRepo, &etaCounterRepo{activeCount: 1}, &etaServiceRepo{}, nil, statsRepo)

	// Empty company ID skips DB plan lookup (CompanyAllowsAdvancedReports returns true).
	unitRepo := &predUnitRepo{u: &models.Unit{ID: unitID, CompanyID: "", Kind: models.UnitKindSubdivision}}

	var mu sync.Mutex
	var sawStaff bool
	hub.BroadcastHook = func(event, room string) {
		if event == "unit.staffing_alert" && room == unitID {
			mu.Lock()
			sawStaff = true
			mu.Unlock()
		}
	}

	p := NewPredictionService(db, hub, eta, unitRepo, ticketRepo)

	done := make(chan struct{})
	go func() {
		defer close(done)
		p.MaybeBroadcastStaffingAlert(context.Background(), unitID)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("MaybeBroadcastStaffingAlert blocked (is hub.Run() running?)")
	}

	mu.Lock()
	ok := sawStaff
	mu.Unlock()
	if !ok {
		t.Fatal("expected unit.staffing_alert broadcast for heuristic high-wait path")
	}
}

// predUnitRepo implements UnitRepository minimally for PredictionService (FindByIDLight only).
type predUnitRepo struct {
	u *models.Unit
}

func (p *predUnitRepo) Transaction(func(tx *gorm.DB) error) error { return nil }
func (p *predUnitRepo) CreateTx(*gorm.DB, *models.Unit) error     { return nil }
func (p *predUnitRepo) Create(*models.Unit) error                 { return nil }
func (p *predUnitRepo) FindAll() ([]models.Unit, error)           { return nil, nil }
func (p *predUnitRepo) FindAllByCompanyID(string) ([]models.Unit, error) {
	return nil, nil
}
func (p *predUnitRepo) FindByID(string) (*models.Unit, error) { return p.u, nil }
func (p *predUnitRepo) FindByIDLight(string) (*models.Unit, error) {
	return p.u, nil
}
func (p *predUnitRepo) Update(*models.Unit) error                  { return nil }
func (p *predUnitRepo) UpdateConfig(string, json.RawMessage) error { return nil }
func (p *predUnitRepo) Delete(string) error                        { return nil }
func (p *predUnitRepo) CountChildren(string) (int64, error)        { return 0, nil }
func (p *predUnitRepo) FindChildSubdivisions(string) ([]models.Unit, error) {
	return nil, nil
}
func (p *predUnitRepo) FindChildUnits(string) ([]models.Unit, error) { return nil, nil }
func (p *predUnitRepo) AddMaterial(*models.UnitMaterial) error       { return nil }
func (p *predUnitRepo) GetMaterials(string) ([]models.UnitMaterial, error) {
	return nil, nil
}
func (p *predUnitRepo) DeleteMaterial(string) error { return nil }
func (p *predUnitRepo) Count() (int64, error)       { return 0, nil }
func (p *predUnitRepo) CreateCompany(*models.Company) error {
	return nil
}
func (p *predUnitRepo) FindFirstByCompanyID(string) (*models.Unit, error) {
	return p.u, nil
}
func (p *predUnitRepo) FindFirstByCompanyIDTx(*gorm.DB, string) (*models.Unit, error) {
	return p.u, nil
}
func (p *predUnitRepo) CountSubdivisionsByCompanyID(string) (int64, error) { return 0, nil }

var _ repository.UnitRepository = (*predUnitRepo)(nil)
