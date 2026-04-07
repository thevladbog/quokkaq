package repository

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type SlotRepository struct{}

func NewSlotRepository() *SlotRepository {
	return &SlotRepository{}
}

func (r *SlotRepository) GetConfigByUnitID(unitID string) (*models.SlotConfig, error) {
	var config models.SlotConfig
	err := database.DB.Where("unit_id = ?", unitID).First(&config).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &config, nil
}

func (r *SlotRepository) CreateOrUpdateConfig(config *models.SlotConfig) error {
	return database.DB.Save(config).Error
}

func (r *SlotRepository) GetWeeklyCapacities(unitID string) ([]models.WeeklySlotCapacity, error) {
	var capacities []models.WeeklySlotCapacity
	err := database.DB.Where("unit_id = ?", unitID).Find(&capacities).Error
	return capacities, err
}

func (r *SlotRepository) SaveWeeklyCapacities(capacities []models.WeeklySlotCapacity) error {
	return database.DB.Save(&capacities).Error
}

func (r *SlotRepository) DeleteWeeklyCapacities(unitID string) error {
	return database.DB.Where("unit_id = ?", unitID).Delete(&models.WeeklySlotCapacity{}).Error
}

func (r *SlotRepository) DeleteWeeklyCapacitiesNotInDays(unitID string, days []string) error {
	if len(days) == 0 {
		// If no days are allowed, delete all capacities
		return r.DeleteWeeklyCapacities(unitID)
	}
	return database.DB.Where("unit_id = ? AND day_of_week NOT IN ?", unitID, days).Delete(&models.WeeklySlotCapacity{}).Error
}

func (r *SlotRepository) GetDaySchedule(unitID, date string) (*models.DaySchedule, error) {
	var schedule models.DaySchedule
	err := database.DB.Preload("ServiceSlots").Where("unit_id = ? AND date = ?", unitID, date).First(&schedule).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &schedule, nil
}

func (r *SlotRepository) SaveDaySchedule(schedule *models.DaySchedule) error {
	// Use Session with FullSaveAssociations to save nested ServiceSlots
	return database.DB.Session(&gorm.Session{FullSaveAssociations: true}).Save(schedule).Error
}

func (r *SlotRepository) DeleteDaySchedule(id string) error {
	return database.DB.Delete(&models.DaySchedule{}, "id = ?", id).Error
}

func (r *SlotRepository) GetDaySchedules(unitID, from, to string) ([]models.DaySchedule, error) {
	var schedules []models.DaySchedule
	err := database.DB.Preload("ServiceSlots").
		Where("unit_id = ? AND date >= ? AND date <= ?", unitID, from, to).
		Find(&schedules).Error
	return schedules, err
}
