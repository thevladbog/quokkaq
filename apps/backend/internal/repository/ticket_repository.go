package repository

import (
	"encoding/json"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TicketHistoryListRow is ticket_histories joined with tickets for unit-scoped activity feeds.
type TicketHistoryListRow struct {
	ID          string
	TicketID    string
	QueueNumber string
	Action      string
	UserID      *string
	Payload     []byte
	CreatedAt   time.Time
}

type TicketRepository interface {
	Transaction(fn func(tx *gorm.DB) error) error
	Create(ticket *models.Ticket) error
	CreateTx(tx *gorm.DB, ticket *models.Ticket) error
	CreateTicketHistory(history *models.TicketHistory) error
	CreateTicketHistoryTx(tx *gorm.DB, history *models.TicketHistory) error
	// AppendEODFlaggedHistoryForUnitTx inserts ticket.eod_flagged rows for tickets locked by the snapshot (same IDs must be passed to MarkAsEODTicketIDsTx).
	AppendEODFlaggedHistoryForUnitTx(tx *gorm.DB, unitID string, actorUserID *string) ([]string, error)
	FindAll() ([]models.Ticket, error)
	FindByID(id string) (*models.Ticket, error)
	FindByIDForUpdateTx(tx *gorm.DB, id string) (*models.Ticket, error)
	FindByUnitID(unitID string) ([]models.Ticket, error)
	FindWaiting(unitID string, serviceID *string) (*models.Ticket, error)
	FindWaitingForUpdateTx(tx *gorm.DB, unitID string, serviceID *string) (*models.Ticket, error)
	Update(ticket *models.Ticket) error
	UpdateTx(tx *gorm.DB, ticket *models.Ticket) error
	Delete(id string) error

	// Sequence related
	GetNextSequence(unitID, serviceID, date string) (int, error)
	GetNextSequenceTx(tx *gorm.DB, unitID, serviceID, date string) (int, error)
	ResetSequences(unitID, date string) error

	// Shift related
	CountWaiting(unitID string) (int64, error)
	GetWaitingTickets(unitID string) ([]models.Ticket, error)
	UpdateStatusByUnit(unitID string, oldStatuses []string, newStatus string) (int64, error)
	GetActiveTicketByCounter(counterID string) (*models.Ticket, error)
	MarkAsEODTicketIDsTx(tx *gorm.DB, ticketIDs []string) (int64, error)
	// CountEODTicketSplitTx counts tickets already marked end-of-day (is_eod=true), split into waiting vs non-waiting status, for EOD messaging.
	CountEODTicketSplitTx(tx *gorm.DB, unitID string) (waiting int64, nonWaiting int64, err error)
	// CountEODTicketSplitByIDsTx counts by status among the given ticket IDs (e.g. the batch marked EOD in this transaction).
	CountEODTicketSplitByIDsTx(tx *gorm.DB, ticketIDs []string) (waiting int64, nonWaiting int64, err error)
	ResetSequencesTx(tx *gorm.DB, unitID, date string) error

	// ListTicketHistoryByUnitID returns recent history for tickets belonging to the unit (keyset pagination).
	ListTicketHistoryByUnitID(unitID string, limit int, beforeTime *time.Time, beforeID *string) ([]TicketHistoryListRow, error)
}

type ticketRepository struct {
	db *gorm.DB
}

func NewTicketRepository() TicketRepository {
	return &ticketRepository{db: database.DB}
}

func (r *ticketRepository) Transaction(fn func(tx *gorm.DB) error) error {
	return r.db.Transaction(fn)
}

func (r *ticketRepository) Create(ticket *models.Ticket) error {
	return r.db.Create(ticket).Error
}

func (r *ticketRepository) CreateTx(tx *gorm.DB, ticket *models.Ticket) error {
	return tx.Create(ticket).Error
}

func (r *ticketRepository) CreateTicketHistory(history *models.TicketHistory) error {
	return r.CreateTicketHistoryTx(r.db, history)
}

func (r *ticketRepository) CreateTicketHistoryTx(tx *gorm.DB, history *models.TicketHistory) error {
	return tx.Create(history).Error
}

func (r *ticketRepository) AppendEODFlaggedHistoryForUnitTx(tx *gorm.DB, unitID string, actorUserID *string) ([]string, error) {
	var ids []string
	if err := tx.Model(&models.Ticket{}).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("unit_id = ? AND is_eod = ?", unitID, false).
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(map[string]string{"unit_id": unitID})
	if err != nil {
		return nil, err
	}
	histories := make([]models.TicketHistory, 0, len(ids))
	for _, id := range ids {
		histories = append(histories, models.TicketHistory{
			TicketID: id,
			Action:   ticketaudit.ActionTicketEODFlagged,
			UserID:   actorUserID,
			Payload:  payload,
		})
	}
	if err := tx.Create(&histories).Error; err != nil {
		return nil, err
	}
	return ids, nil
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

func (r *ticketRepository) FindByIDForUpdateTx(tx *gorm.DB, id string) (*models.Ticket, error) {
	var ticket models.Ticket
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ticket, "id = ?", id).Error
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
	err := query.Order("priority desc, created_at asc").First(&ticket).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ticketRepository) FindWaitingForUpdateTx(tx *gorm.DB, unitID string, serviceID *string) (*models.Ticket, error) {
	query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false)
	if serviceID != nil {
		query = query.Where("service_id = ?", *serviceID)
	}
	var ticket models.Ticket
	err := query.Order("priority desc, created_at asc").First(&ticket).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ticketRepository) Update(ticket *models.Ticket) error {
	return r.UpdateTx(r.db, ticket)
}

func (r *ticketRepository) UpdateTx(tx *gorm.DB, ticket *models.Ticket) error {
	return tx.Save(ticket).Error
}

func (r *ticketRepository) Delete(id string) error {
	return r.db.Delete(&models.Ticket{}, "id = ?", id).Error
}

func (r *ticketRepository) GetNextSequence(unitID, serviceID, date string) (int, error) {
	return r.GetNextSequenceTx(r.db, unitID, serviceID, date)
}

func (r *ticketRepository) GetNextSequenceTx(tx *gorm.DB, unitID, serviceID, date string) (int, error) {
	var seq models.TicketNumberSequence
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("unit_id = ? AND service_id = ? AND date = ?", unitID, serviceID, date).
		First(&seq).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			seq = models.TicketNumberSequence{
				UnitID:     unitID,
				ServiceID:  serviceID,
				Date:       date,
				LastNumber: 1,
			}
			if err := tx.Create(&seq).Error; err != nil {
				return 0, err
			}
			return 1, nil
		}
		return 0, err
	}

	seq.LastNumber++
	if err := tx.Save(&seq).Error; err != nil {
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

func (r *ticketRepository) MarkAsEODTicketIDsTx(tx *gorm.DB, ticketIDs []string) (int64, error) {
	if len(ticketIDs) == 0 {
		return 0, nil
	}
	result := tx.Model(&models.Ticket{}).
		Where("id IN ?", ticketIDs).
		Update("is_eod", true)
	return result.RowsAffected, result.Error
}

func (r *ticketRepository) CountEODTicketSplitTx(tx *gorm.DB, unitID string) (waiting int64, nonWaiting int64, err error) {
	if err = tx.Model(&models.Ticket{}).
		Where("unit_id = ? AND is_eod = ? AND status = ?", unitID, true, "waiting").
		Count(&waiting).Error; err != nil {
		return 0, 0, err
	}
	if err = tx.Model(&models.Ticket{}).
		Where("unit_id = ? AND is_eod = ? AND status <> ?", unitID, true, "waiting").
		Count(&nonWaiting).Error; err != nil {
		return 0, 0, err
	}
	return waiting, nonWaiting, nil
}

func (r *ticketRepository) CountEODTicketSplitByIDsTx(tx *gorm.DB, ticketIDs []string) (waiting int64, nonWaiting int64, err error) {
	if len(ticketIDs) == 0 {
		return 0, 0, nil
	}
	if err = tx.Model(&models.Ticket{}).
		Where("id IN ? AND status = ?", ticketIDs, "waiting").
		Count(&waiting).Error; err != nil {
		return 0, 0, err
	}
	if err = tx.Model(&models.Ticket{}).
		Where("id IN ? AND status <> ?", ticketIDs, "waiting").
		Count(&nonWaiting).Error; err != nil {
		return 0, 0, err
	}
	return waiting, nonWaiting, nil
}

func (r *ticketRepository) ListTicketHistoryByUnitID(unitID string, limit int, beforeTime *time.Time, beforeID *string) ([]TicketHistoryListRow, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	q := r.db.Table("ticket_histories AS h").
		Select("h.id, h.ticket_id, t.queue_number AS queue_number, h.action, h.user_id, h.payload, h.created_at").
		Joins("INNER JOIN tickets AS t ON t.id = h.ticket_id").
		Where("t.unit_id = ?", unitID).
		Order("h.created_at DESC, h.id DESC").
		Limit(limit)
	if beforeTime != nil && beforeID != nil && *beforeID != "" {
		q = q.Where("(h.created_at < ?) OR (h.created_at = ? AND h.id < ?)", *beforeTime, *beforeTime, *beforeID)
	}
	var rows []TicketHistoryListRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
