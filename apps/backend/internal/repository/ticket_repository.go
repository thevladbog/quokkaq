package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/pkg/database"

	"github.com/google/uuid"
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
	ActorName   string `gorm:"column:actor_name"` // from users.name via LEFT JOIN
	Payload     []byte
	CreatedAt   time.Time
}

// TicketHistoryListFilters narrows journal rows (predicates are AND-combined). Nil pointer fields are ignored.
// Weekdays and date range use PostgreSQL in the unit's timezone (single INNER JOIN units AS u_f).
// Weekdays: EXTRACT(DOW) 0=Sunday … 6=Saturday. DateFrom/DateTo: YYYY-MM-DD inclusive on (history created_at AT TIME ZONE unit.timezone)::date.
type TicketHistoryListFilters struct {
	CounterID   *string
	ActorUserID *string
	ClientID    *string
	Ticket      *string // UUID → exact ticket id; otherwise queue_number ILIKE
	Search      *string // q: queue, ticket id, visitor name
	Weekdays    []int   // 0–6, deduplicated in applyTicketHistoryFilters
	DateFrom    *string // YYYY-MM-DD inclusive lower bound (unit TZ calendar date)
	DateTo      *string // YYYY-MM-DD inclusive upper bound (unit TZ calendar date)
}

// ShiftActivityActorRow is a distinct actor who appears in ticket history for a unit.
type ShiftActivityActorRow struct {
	UserID string
	Name   string
}

func escapeSQLLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func normalizeWeekdaysDOW(w []int) []int {
	seen := make(map[int]struct{}, len(w))
	out := make([]int, 0, len(w))
	for _, d := range w {
		if d < 0 || d > 6 {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	return out
}

func applyTicketHistoryFilters(q *gorm.DB, filters *TicketHistoryListFilters) *gorm.DB {
	if filters == nil {
		return q
	}
	if filters.CounterID != nil && strings.TrimSpace(*filters.CounterID) != "" {
		q = q.Where("t.counter_id = ?", strings.TrimSpace(*filters.CounterID))
	}
	if filters.ActorUserID != nil && strings.TrimSpace(*filters.ActorUserID) != "" {
		q = q.Where("h.user_id = ?", strings.TrimSpace(*filters.ActorUserID))
	}
	if filters.ClientID != nil && strings.TrimSpace(*filters.ClientID) != "" {
		q = q.Where("t.client_id = ?", strings.TrimSpace(*filters.ClientID))
	}
	if filters.Ticket != nil {
		ticketTrim := strings.TrimSpace(*filters.Ticket)
		if ticketTrim != "" {
			if _, err := uuid.Parse(ticketTrim); err == nil {
				q = q.Where("t.id = ?", ticketTrim)
			} else {
				like := "%" + escapeSQLLike(ticketTrim) + "%"
				q = q.Where("t.queue_number ILIKE ? ESCAPE '\\'", like)
			}
		}
	}
	if filters.Search != nil {
		searchTrim := strings.TrimSpace(*filters.Search)
		if searchTrim != "" {
			q = q.Joins("LEFT JOIN unit_clients AS c ON c.id = t.client_id AND c.unit_id = t.unit_id")
			like := "%" + escapeSQLLike(searchTrim) + "%"
			sub := "t.queue_number ILIKE ? ESCAPE '\\'"
			args := []interface{}{like}
			if parsed, err := uuid.Parse(searchTrim); err == nil {
				sub += " OR t.id = ?"
				args = append(args, parsed.String())
			}
			sub += " OR (c.id IS NOT NULL AND CONCAT(TRIM(c.first_name), ' ', TRIM(c.last_name)) ILIKE ? ESCAPE '\\')"
			args = append(args, like)
			q = q.Where("("+sub+")", args...)
		}
	}
	wd := normalizeWeekdaysDOW(filters.Weekdays)
	needsUnitTZ := len(wd) > 0
	if filters.DateFrom != nil && strings.TrimSpace(*filters.DateFrom) != "" {
		needsUnitTZ = true
	}
	if filters.DateTo != nil && strings.TrimSpace(*filters.DateTo) != "" {
		needsUnitTZ = true
	}
	if needsUnitTZ {
		q = q.Joins("INNER JOIN units AS u_f ON u_f.id = t.unit_id")
	}
	if len(wd) > 0 {
		q = q.Where("EXTRACT(DOW FROM (h.created_at AT TIME ZONE u_f.timezone)) IN ?", wd)
	}
	if filters.DateFrom != nil {
		df := strings.TrimSpace(*filters.DateFrom)
		if df != "" {
			q = q.Where("(h.created_at AT TIME ZONE u_f.timezone)::date >= ?::date", df)
		}
	}
	if filters.DateTo != nil {
		dt := strings.TrimSpace(*filters.DateTo)
		if dt != "" {
			q = q.Where("(h.created_at AT TIME ZONE u_f.timezone)::date <= ?::date", dt)
		}
	}
	return q
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
	// FindBySubdivisionAndServiceZoneID returns non-EOD tickets for a waiting pool (subdivision row + service_zone_id = zone).
	FindBySubdivisionAndServiceZoneID(subdivisionID, serviceZoneID string) ([]models.Ticket, error)
	// FindWaiting returns the next waiting ticket; counterPool nil = subdivision-wide pool (service_zone_id IS NULL).
	FindWaiting(unitID string, serviceIDs []string, counterPool *string) (*models.Ticket, error)
	FindWaitingForUpdateTx(tx *gorm.DB, unitID string, serviceIDs []string, counterPool *string) (*models.Ticket, error)
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
	GetActiveTicketByCounterTx(tx *gorm.DB, counterID string) (*models.Ticket, error)
	// GetActiveTicketByCounterLight loads only id, queue_number, status (no preloads) for polling paths.
	GetActiveTicketByCounterLight(counterID string) (*models.Ticket, error)
	// FindInServiceTicketByCounter returns the ticket at the counter with status in_service, if any.
	FindInServiceTicketByCounter(counterID string) (*models.Ticket, error)
	MarkAsEODTicketIDsTx(tx *gorm.DB, ticketIDs []string) (int64, error)
	// CountEODTicketSplitTx counts tickets already marked end-of-day (is_eod=true), split into waiting vs non-waiting status, for EOD messaging.
	CountEODTicketSplitTx(tx *gorm.DB, unitID string) (waiting int64, nonWaiting int64, err error)
	// CountEODTicketSplitByIDsTx counts by status among the given ticket IDs (e.g. the batch marked EOD in this transaction).
	CountEODTicketSplitByIDsTx(tx *gorm.DB, ticketIDs []string) (waiting int64, nonWaiting int64, err error)
	// FinalizeEODTicketStatusesTx sets terminal status and completed_at on EOD-flagged tickets so warehouse/hourly stats
	// bucket them by EOD time. Call after CountEODTicketSplitByIDsTx (toast counts use pre-finalize status).
	FinalizeEODTicketStatusesTx(tx *gorm.DB, ticketIDs []string, eodCloseAt time.Time, actorUserID *string) error
	// ListOrphanEODTicketIDsTx returns EOD-flagged tickets that still lack completed_at (legacy runs before finalize existed).
	ListOrphanEODTicketIDsTx(tx *gorm.DB, unitID string) ([]string, error)
	ResetSequencesTx(tx *gorm.DB, unitID, date string) error

	// ListTicketHistoryByUnitID returns recent history for tickets belonging to the unit (keyset pagination).
	ListTicketHistoryByUnitID(unitID string, limit int, beforeTime *time.Time, beforeID *string, filters *TicketHistoryListFilters) ([]TicketHistoryListRow, error)
	// ListShiftActivityActorRows returns distinct users who authored ticket history in the unit (for journal filters).
	ListShiftActivityActorRows(unitID string, limit int) ([]ShiftActivityActorRow, error)
	// ListVisitsByClientID returns tickets for a client in the unit (newest first, keyset pagination).
	ListVisitsByClientID(unitID, clientID string, limit int, beforeTime *time.Time, beforeID *string) ([]models.Ticket, error)
	// ListTerminalVisitActorNamesByTicketIDs returns display names of users who last moved each ticket to a terminal status (PostgreSQL).
	ListTerminalVisitActorNamesByTicketIDs(ticketIDs []string) (map[string]string, error)
	// ListTransferHistoriesByTicketIDs returns ticket.transferred rows for the given tickets (oldest first).
	ListTransferHistoriesByTicketIDs(ticketIDs []string) ([]models.TicketHistory, error)
	// GetWaitingTicketsWithSLA returns waiting (non-EOD) tickets for a unit that have a positive
	// max_waiting_time snapshot. Used by the SLA monitor to detect threshold crossings.
	GetWaitingTicketsWithSLA(unitID string) ([]models.Ticket, error)
	// GetInServiceTicketsWithSLA returns in_service (non-EOD) tickets for a unit that have a positive
	// max_service_time snapshot and a non-null confirmed_at. Used by the SLA monitor.
	GetInServiceTicketsWithSLA(unitID string) ([]models.Ticket, error)
	// GetRecentCompletedServiceTimes returns the last `limit` service durations (seconds) for completed
	// tickets of a given service in a unit. Duration = completed_at - confirmed_at.
	GetRecentCompletedServiceTimes(unitID, serviceID string, limit int) ([]int, error)
	// GetQueuePosition returns the 1-based position of a waiting ticket in its unit queue
	// (number of waiting non-EOD tickets with higher priority or same priority and earlier createdAt, plus 1).
	GetQueuePosition(ticket *models.Ticket) (int, error)
	// CountWaitingByUnit returns the number of non-EOD waiting tickets for a unit (all services).
	CountWaitingByUnit(unitID string) (int64, error)
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
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").Preload("Client.Definitions").Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) FindByID(id string) (*models.Ticket, error) {
	var ticket models.Ticket
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").Preload("Client.Definitions").First(&ticket, "id = ?", id).Error
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
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").Preload("Client.Definitions").
		Where("unit_id = ? AND is_eod = ?", unitID, false).
		Order("created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) FindBySubdivisionAndServiceZoneID(subdivisionID, serviceZoneID string) ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Unit").Preload("Service").Preload("Counter").Preload("PreRegistration").Preload("Client.Definitions").
		Where("unit_id = ? AND service_zone_id = ? AND is_eod = ?", subdivisionID, serviceZoneID, false).
		Order("created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func applyWaitingPoolFilter(db *gorm.DB, counterPool *string) *gorm.DB {
	if counterPool == nil {
		return db.Where("service_zone_id IS NULL")
	}
	return db.Where("service_zone_id = ?", *counterPool)
}

func (r *ticketRepository) FindWaiting(unitID string, serviceIDs []string, counterPool *string) (*models.Ticket, error) {
	query := r.db.Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false)
	query = applyWaitingPoolFilter(query, counterPool)
	if len(serviceIDs) > 0 {
		query = query.Where("service_id IN ?", serviceIDs)
	}
	var ticket models.Ticket
	err := query.Order("priority desc, created_at asc").First(&ticket).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ticketRepository) FindWaitingForUpdateTx(tx *gorm.DB, unitID string, serviceIDs []string, counterPool *string) (*models.Ticket, error) {
	query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false)
	query = applyWaitingPoolFilter(query, counterPool)
	if len(serviceIDs) > 0 {
		query = query.Where("service_id IN ?", serviceIDs)
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
	err := r.db.Preload("Service").Preload("PreRegistration").Preload("Client.Definitions").
		Where("unit_id = ? AND status = ? AND is_eod = ?", unitID, "waiting", false).
		Order("priority desc, created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) GetWaitingTicketsWithSLA(unitID string) ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Service").
		Where("unit_id = ? AND status = ? AND is_eod = ? AND max_waiting_time IS NOT NULL AND max_waiting_time > 0",
			unitID, "waiting", false).
		Order("created_at asc").
		Find(&tickets).Error
	return tickets, err
}

func (r *ticketRepository) GetInServiceTicketsWithSLA(unitID string) ([]models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Preload("Service").
		Where("unit_id = ? AND status = ? AND is_eod = ? AND max_service_time IS NOT NULL AND max_service_time > 0 AND confirmed_at IS NOT NULL",
			unitID, "in_service", false).
		Order("confirmed_at asc").
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
	return r.GetActiveTicketByCounterTx(r.db, counterID)
}

func (r *ticketRepository) GetActiveTicketByCounterLight(counterID string) (*models.Ticket, error) {
	var tickets []models.Ticket
	err := r.db.Select("id", "queue_number", "status").
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

func (r *ticketRepository) GetActiveTicketByCounterTx(tx *gorm.DB, counterID string) (*models.Ticket, error) {
	if tx == nil {
		return nil, errors.New("nil tx for GetActiveTicketByCounterTx")
	}
	var tickets []models.Ticket
	err := tx.Preload("Service").Preload("PreRegistration").Preload("Client.Definitions").
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

func (r *ticketRepository) FindInServiceTicketByCounter(counterID string) (*models.Ticket, error) {
	var t models.Ticket
	err := r.db.Where("counter_id = ? AND status = ? AND is_eod = ?", counterID, "in_service", false).
		Order("created_at ASC").
		First(&t).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
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

func (r *ticketRepository) FinalizeEODTicketStatusesTx(tx *gorm.DB, ticketIDs []string, eodCloseAt time.Time, actorUserID *string) error {
	if len(ticketIDs) == 0 {
		return nil
	}
	if eodCloseAt.IsZero() {
		return fmt.Errorf("invalid eodCloseAt: zero value")
	}
	var tickets []models.Ticket
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id IN ? AND is_eod = ? AND completed_at IS NULL AND status IN ?", ticketIDs, true, []string{"waiting", "called", "in_service"}).
		Find(&tickets).Error; err != nil {
		return err
	}
	for i := range tickets {
		t := &tickets[i]
		from := t.Status
		var to string
		switch from {
		case "waiting":
			to = "no_show"
		case "called", "in_service":
			to = "cancelled"
		default:
			continue
		}
		res := tx.Model(&models.Ticket{}).
			Where("id = ? AND is_eod = ? AND completed_at IS NULL", t.ID, true).
			Updates(map[string]interface{}{
				"status":       to,
				"completed_at": eodCloseAt,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return fmt.Errorf("finalize eod ticket %s: expected 1 row updated, got %d", t.ID, res.RowsAffected)
		}
		payload, err := json.Marshal(map[string]interface{}{
			"unit_id":     t.UnitID,
			"from_status": from,
			"to_status":   to,
			"reason":      "end_of_day",
		})
		if err != nil {
			return err
		}
		h := models.TicketHistory{
			TicketID: t.ID,
			Action:   ticketaudit.ActionTicketStatusChanged,
			UserID:   actorUserID,
			Payload:  payload,
		}
		if err := tx.Create(&h).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *ticketRepository) ListOrphanEODTicketIDsTx(tx *gorm.DB, unitID string) ([]string, error) {
	var ids []string
	err := tx.Model(&models.Ticket{}).
		Where("unit_id = ? AND is_eod = ? AND completed_at IS NULL AND status IN ?", unitID, true, []string{"waiting", "called", "in_service"}).
		Pluck("id", &ids).Error
	return ids, err
}

func (r *ticketRepository) ListTicketHistoryByUnitID(unitID string, limit int, beforeTime *time.Time, beforeID *string, filters *TicketHistoryListFilters) ([]TicketHistoryListRow, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	q := r.db.Table("ticket_histories AS h").
		Select(`h.id, h.ticket_id, t.queue_number AS queue_number, h.action, h.user_id,
			COALESCE(
				NULLIF(TRIM(u.name), ''),
				NULLIF(TRIM(COALESCE(u.email, '')), '')
			) AS actor_name, h.payload, h.created_at`).
		Joins("INNER JOIN tickets AS t ON t.id = h.ticket_id").
		Joins("LEFT JOIN users AS u ON u.id::text = h.user_id::text").
		Where("t.unit_id = ?", unitID)
	q = applyTicketHistoryFilters(q, filters)
	q = q.Order("h.created_at DESC, h.id DESC").Limit(limit)
	if beforeTime != nil && beforeID != nil && *beforeID != "" {
		q = q.Where("(h.created_at < ?) OR (h.created_at = ? AND h.id < ?)", *beforeTime, *beforeTime, *beforeID)
	}
	var rows []TicketHistoryListRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *ticketRepository) ListShiftActivityActorRows(unitID string, limit int) ([]ShiftActivityActorRow, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 300 {
		limit = 300
	}
	var rows []ShiftActivityActorRow
	err := r.db.Table("ticket_histories AS h").
		Select(`h.user_id AS user_id, COALESCE(
			NULLIF(TRIM(MAX(u.name)), ''),
			NULLIF(TRIM(MAX(COALESCE(u.email, ''))), '')
		) AS name`).
		Joins("INNER JOIN tickets AS t ON t.id = h.ticket_id").
		Joins("LEFT JOIN users AS u ON u.id::text = h.user_id::text").
		Where("t.unit_id = ? AND h.user_id IS NOT NULL", unitID).
		Group("h.user_id").
		Order("COALESCE(MAX(u.name), '') ASC, h.user_id ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *ticketRepository) ListVisitsByClientID(unitID, clientID string, limit int, beforeTime *time.Time, beforeID *string) ([]models.Ticket, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 101 {
		limit = 101
	}
	q := r.db.Where("unit_id = ? AND client_id = ?", unitID, clientID).
		Preload("Service").Preload("Counter").
		Order("created_at DESC, id DESC").
		Limit(limit)
	if beforeTime != nil && beforeID != nil && *beforeID != "" {
		q = q.Where("(created_at < ?) OR (created_at = ? AND id < ?)", *beforeTime, *beforeTime, *beforeID)
	}
	var tickets []models.Ticket
	if err := q.Find(&tickets).Error; err != nil {
		return nil, err
	}
	return tickets, nil
}

func (r *ticketRepository) ListTransferHistoriesByTicketIDs(ticketIDs []string) ([]models.TicketHistory, error) {
	var rows []models.TicketHistory
	if len(ticketIDs) == 0 {
		return rows, nil
	}
	err := r.db.Where("ticket_id IN ? AND action = ?", ticketIDs, ticketaudit.ActionTicketTransferred).
		Order("created_at ASC, id ASC").
		Find(&rows).Error
	return rows, err
}

func (r *ticketRepository) ListTerminalVisitActorNamesByTicketIDs(ticketIDs []string) (map[string]string, error) {
	out := make(map[string]string)
	if len(ticketIDs) == 0 {
		return out, nil
	}
	var rows []struct {
		TicketID  string         `gorm:"column:ticket_id"`
		ActorName sql.NullString `gorm:"column:actor_name"`
	}
	err := r.db.Raw(`
		SELECT DISTINCT ON (h.ticket_id) h.ticket_id,
			COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.email), '')) AS actor_name
		FROM ticket_histories h
		LEFT JOIN users u ON u.id::text = h.user_id::text
		WHERE h.ticket_id IN ?
		AND h.action = ?
		AND (h.payload::jsonb->>'to_status') IN ('served', 'no_show', 'cancelled', 'completed')
		ORDER BY h.ticket_id, h.created_at DESC, h.id DESC
	`, ticketIDs, ticketaudit.ActionTicketStatusChanged).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.ActorName.Valid && strings.TrimSpace(row.ActorName.String) != "" {
			out[row.TicketID] = strings.TrimSpace(row.ActorName.String)
		}
	}
	return out, nil
}

func (r *ticketRepository) GetRecentCompletedServiceTimes(unitID, serviceID string, limit int) ([]int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	var durations []int
	q := r.db.Model(&models.Ticket{}).
		Select("EXTRACT(EPOCH FROM (completed_at - confirmed_at))::int AS duration_sec").
		Where("unit_id = ? AND status = 'served' AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at > confirmed_at AND is_eod = false", unitID)
	if serviceID != "" {
		q = q.Where("service_id = ?", serviceID)
	}
	q = q.Order("completed_at DESC").Limit(limit)
	err := q.Scan(&durations).Error
	if err != nil {
		return nil, err
	}
	return durations, nil
}

func (r *ticketRepository) GetQueuePosition(ticket *models.Ticket) (int, error) {
	var count int64
	err := r.db.Model(&models.Ticket{}).
		Where(
			"unit_id = ? AND status = 'waiting' AND is_eod = false AND (priority > ? OR (priority = ? AND created_at < ?))",
			ticket.UnitID, ticket.Priority, ticket.Priority, ticket.CreatedAt,
		).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return int(count) + 1, nil
}

func (r *ticketRepository) CountWaitingByUnit(unitID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Ticket{}).
		Where("unit_id = ? AND status = 'waiting' AND is_eod = false", unitID).
		Count(&count).Error
	return count, err
}
