package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

type failingAnomalyAlertRepo struct{}

func (failingAnomalyAlertRepo) Create(_ context.Context, _ *models.AnomalyAlert) error {
	return errors.New("persist down")
}

func (failingAnomalyAlertRepo) ListByUnit(_ context.Context, _ string, _ int) ([]models.AnomalyAlert, error) {
	return nil, nil
}

// TestAnomalyEmit_persistErrorAdvancesCooldown records last-seen when the DB write fails
// so RunPeriodicCheck does not retry the same hot path every run.
func TestAnomalyEmit_persistErrorAdvancesCooldown(t *testing.T) {
	t.Parallel()
	a := &AnomalyService{
		last:      make(map[string]time.Time),
		alertRepo: failingAnomalyAlertRepo{},
		hub:       nil,
	}
	uid := "u-sub-1"
	a.emit(context.Background(), uid, "arrival_spike", "msg")
	a.mu.Lock()
	_, ok := a.last[uid]
	a.mu.Unlock()
	if !ok {
		t.Fatal("expected last map updated after failed Create")
	}
}
