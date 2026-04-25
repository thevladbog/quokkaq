package testsupport

import (
	"encoding/json"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// PanicUnitRepo satisfies repository.UnitRepository and panics on any call.
type PanicUnitRepo struct{}

func (PanicUnitRepo) Transaction(func(*gorm.DB) error) error { panic("unexpected") }
func (PanicUnitRepo) CreateTx(*gorm.DB, *models.Unit) error  { panic("unexpected") }
func (PanicUnitRepo) Create(*models.Unit) error              { panic("unexpected") }
func (PanicUnitRepo) FindAll() ([]models.Unit, error)        { panic("unexpected") }
func (PanicUnitRepo) FindAllByCompanyID(string) ([]models.Unit, error) {
	panic("unexpected")
}
func (PanicUnitRepo) FindByID(string) (*models.Unit, error) { panic("unexpected") }
func (PanicUnitRepo) FindByIDLight(string) (*models.Unit, error) {
	panic("unexpected")
}
func (PanicUnitRepo) FindByIDLightTxForUpdate(*gorm.DB, string) (*models.Unit, error) {
	panic("unexpected")
}
func (PanicUnitRepo) Update(*models.Unit) error                           { panic("unexpected") }
func (PanicUnitRepo) UpdateConfig(string, json.RawMessage) error          { panic("unexpected") }
func (PanicUnitRepo) Delete(string) error                                 { panic("unexpected") }
func (PanicUnitRepo) CountChildren(string) (int64, error)                 { panic("unexpected") }
func (PanicUnitRepo) FindChildSubdivisions(string) ([]models.Unit, error) { panic("unexpected") }
func (PanicUnitRepo) FindChildUnits(string) ([]models.Unit, error)        { panic("unexpected") }
func (PanicUnitRepo) AddMaterial(*models.UnitMaterial) error              { panic("unexpected") }
func (PanicUnitRepo) GetMaterials(string) ([]models.UnitMaterial, error) {
	panic("unexpected")
}
func (PanicUnitRepo) DeleteMaterial(string) error                       { panic("unexpected") }
func (PanicUnitRepo) Count() (int64, error)                             { panic("unexpected") }
func (PanicUnitRepo) CreateCompany(*models.Company) error               { panic("unexpected") }
func (PanicUnitRepo) FindFirstByCompanyID(string) (*models.Unit, error) { panic("unexpected") }
func (PanicUnitRepo) FindFirstByCompanyIDTx(*gorm.DB, string) (*models.Unit, error) {
	panic("unexpected")
}
func (PanicUnitRepo) CountSubdivisionsByCompanyID(string) (int64, error) { panic("unexpected") }

var _ repository.UnitRepository = PanicUnitRepo{}
