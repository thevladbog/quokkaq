package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TicketRepository interface {
	Create(ticket *models.Ticket) error
	FindAll() ([]models.Ticket, error)
	FindByID(id string) (*models.Ticket, error)
	FindByUnitID(unitID string) ([]models.Ticket, error)
	FindWaiting(unitID string, serviceID *string) (*models.Ticket, error)
	Update(ticket *models.Ticket) error
	Delete(id string) error

	// Sequence related
	GetNextSequence(unitID, serviceID, date string) (int, error)
	ResetSequences(unitID, date string) error

	// Shift related
	CountWaiting(unitID string) (int64, error)
	GetWaitingTickets(unitID string) ([]models.Ticket, error)
	UpdateStatusByUnit(unitID string, oldStatuses []string, newStatus string) (int64, error)
	GetActiveTicketByCounter(counterID string) (*models.Ticket, error)
	MarkAsEOD(unitID string) (int64, error)
	MarkAsEODTx(tx *gorm.DB, unitID string) (int64, error)
	ResetSequencesTx(tx *gorm.DB, unitID, date string) error
}

type ticketRepository struct {
	db *gorm.DB
}

func NewTicketRepository() TicketRepository {
	return &ticketRepository{db: database.DB}
}

func (r *ticketRepository) Create(ticket *models.Ticket) error {
	return r.db.Create(ticket).Error
}

func (r *ticketRepository) FindAll() ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) FindByID(id string) (*models.Ticket, error) {
	var ticket models.Ticket
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").First(&ticket, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ticketRepository) FindByUnitID(unitID string) ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").
		Where("unit_id = ? AND is_eod = ?", unitID, false).
		Order("created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) FindWaiting(unitID string, serviceID *string) (*models.Ticket, error) {
	query := r.db.Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false)
	if serviceID != nil {
		query = query.Where("service_id = ?", *serviceID)
	}

	var ticket models.Ticket
	// Order by Priority DESC, CreatedAt ASC
	err := query.Order("priority desc, created_at asc").First(&ticket).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ticketRepository) Update(ticket *models.Ticket) error {
	return r.db.Save(ticket).Error
}

func (r *ticketRepository) Delete(id string) error {
	return r.db.Delete(&models.Ticket{}, "id = ?", id).Error
}

func (r *ticketRepository) GetNextSequence(unitID, serviceID, date string) (int, error) {
	var seq models.TicketNumberSequence
	// Use locking to prevent race conditions
	err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("unit_id = ? AND service_id = ? AND date = ?", unitID, serviceID, date).
		First(&seq).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Create new sequence
			// We might still have a race here if two threads reach here at same time
			// Ideally we should have a unique index on (unit_id, service_id, date)
			// and handle duplicate key error, but for now let's try to create.
			seq = models.TicketNumberSequence{
				UnitID:     unitID,
				ServiceID:  serviceID,
				Date:       date,
				LastNumber: 1,
			}
			if err := r.db.Create(&seq).Error; err != nil {
				// If create fails (likely due to unique constraint if we had one, or race),
				// we should retry or return error.
				// For now, let's return error.
				return 0, err
			}
			return 1, nil
		}
		return 0, err
	}

	// Increment
	seq.LastNumber++
	if err := r.db.Save(&seq).Error; err != nil {
		return 0, err
	}
	return seq.LastNumber, nil
}

func (r *ticketRepository) ResetSequences(unitID, date string) error {
	return r.ResetSequencesTx(r.db, unitID, date)
}

func (r *ticketRepository) ResetSequencesTx(tx *gorm.DB, unitID, date string) error {
	return tx.Model(&models.TicketNumberSequence{}).
		Where("unit_id = ? AND date = ?", unitID, date).
		Update("last_number", 0).Error
}

func (r *ticketRepository) CountWaiting(unitID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Ticket{}).
		Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false).
		Count(&count).Error
	return count, err
}

func (r *ticketRepository) GetWaitingTickets(unitID string) ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Service").Preload("PreRegistration").
		Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false).
		Order("priority desc, created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) UpdateStatusByUnit(unitID string, oldStatuses []string, newStatus string) (int64, error) {
	result := r.db.Model(&models.Ticket{}).
		Where("unit_id = ? AND status IN ?", unitID, oldStatuses).
		Update("status", newStatus)
	return result.RowsAffected, result.Error
}

func (r *ticketRepository) GetActiveTicketByCounter(counterID string) (*models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Service").Preload("PreRegistration").
		Where("counter_id = ? AND status IN ? AND is_eod = ?", counterID, []string{"called", "in_service"}, false).
		Limit(1).
		Find(&tickets).Error
	if err != nil {
		return nil, err
	}
	if len(tickets) == 0 {
		return nil, nil
	}
	return &tickets[0], nil
}

func (r *ticketRepository) MarkAsEOD(unitID string) (int64, error) {
	return r.MarkAsEODTx(r.db, unitID)
}

func (r *ticketRepository) MarkAsEODTx(tx *gorm.DB, unitID string) (int64, error) {
	result := tx.Model(&models.Ticket{}).
		Where("unit_id = ? AND is_eod = ?", unitID, false).
		Update("is_eod", true)
	return result.RowsAffected, result.Error
}
