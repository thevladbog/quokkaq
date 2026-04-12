package services

import (
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

func closeOperatorIntervalsForCounterTx(tx *gorm.DB, intervalRepo repository.OperatorIntervalRepository, counterID string, endAt time.Time) error {
	_, err := intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, endAt)
	return err
}

func insertOperatorIntervalTx(tx *gorm.DB, intervalRepo repository.OperatorIntervalRepository, unitID, counterID, userID, kind string, startedAt time.Time) error {
	return intervalRepo.InsertTx(tx, &models.CounterOperatorInterval{
		UnitID:    unitID,
		CounterID: counterID,
		UserID:    userID,
		Kind:      kind,
		StartedAt: startedAt,
	})
}

// ensureIdleIfCounterAvailableTx opens an idle interval when the counter is occupied, not on break,
// has no active ticket, and no open interval row (idempotent).
func ensureIdleIfCounterAvailableTx(
	tx *gorm.DB,
	intervalRepo repository.OperatorIntervalRepository,
	counterRepo repository.CounterRepository,
	ticketRepo repository.TicketRepository,
	counterID string,
	now time.Time,
) error {
	hasOpen, err := intervalRepo.HasOpenIntervalForCounterTx(tx, counterID)
	if err != nil {
		return err
	}
	if hasOpen {
		return nil
	}
	counter, err := counterRepo.FindByIDTx(tx, counterID)
	if err != nil {
		return err
	}
	if counter.AssignedTo == nil || counter.OnBreak {
		return nil
	}
	active, err := ticketRepo.GetActiveTicketByCounterTx(tx, counterID)
	if err != nil {
		return err
	}
	if active != nil {
		return nil
	}
	return insertOperatorIntervalTx(tx, intervalRepo, counter.UnitID, counterID, *counter.AssignedTo, models.OperatorIntervalKindIdle, now)
}

func closeIdleOnCallTx(tx *gorm.DB, intervalRepo repository.OperatorIntervalRepository, counterID string, now time.Time) error {
	return closeOperatorIntervalsForCounterTx(tx, intervalRepo, counterID, now)
}

func ticketStatusIsActiveAtCounter(status string) bool {
	return status == "called" || status == "in_service"
}
