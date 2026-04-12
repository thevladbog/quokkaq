package services

import (
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

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
	counter, err := counterRepo.FindByIDForUpdateTx(tx, counterID)
	if err != nil {
		return err
	}
	hasOpen, err := intervalRepo.HasOpenIntervalForCounterTx(tx, counterID)
	if err != nil {
		return err
	}
	if hasOpen {
		return nil
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

// closeIdleOnCallTx ends only open idle intervals (models.OperatorIntervalKindIdle) when a ticket is called.
// It uses intervalRepo.CloseOpenIdleIntervalsForCounterTx instead of intervalRepo.CloseOpenIntervalsForCounterTx
// (previously reached through closeOperatorIntervalsForCounterTx), which would set ended_at on every open row for the
// counter, including non-idle kinds such as break.
func closeIdleOnCallTx(tx *gorm.DB, intervalRepo repository.OperatorIntervalRepository, counterID string, now time.Time) error {
	_, err := intervalRepo.CloseOpenIdleIntervalsForCounterTx(tx, counterID, now)
	return err
}

func ticketStatusIsActiveAtCounter(status string) bool {
	return status == "called" || status == "in_service"
}
