package services

import (
	"context"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// bootstrapRevocationRaceRepository models the persisted terminal separately
// from the snapshot returned to Bootstrap. It revokes the persisted terminal
// immediately after the lookup, which is the exact stale-row window that the
// former FindByPairingCodeDigest + Update flow could resurrect.
type bootstrapRevocationRaceRepository struct {
	stored models.DesktopTerminal
}

var _ repository.DesktopTerminalRepository = (*bootstrapRevocationRaceRepository)(nil)

func (r *bootstrapRevocationRaceRepository) Create(*models.DesktopTerminal) error { return nil }

func (r *bootstrapRevocationRaceRepository) FindAll() ([]models.DesktopTerminal, error) {
	return nil, nil
}

func (r *bootstrapRevocationRaceRepository) FindAllByCompanyID(string) ([]models.DesktopTerminal, error) {
	return nil, nil
}

func (r *bootstrapRevocationRaceRepository) FindByID(string) (*models.DesktopTerminal, error) {
	copy := r.stored
	return &copy, nil
}

func (r *bootstrapRevocationRaceRepository) FindActiveByID(context.Context, string) (*models.DesktopTerminal, error) {
	if r.stored.RevokedAt != nil {
		return nil, gorm.ErrRecordNotFound
	}
	copy := r.stored
	return &copy, nil
}

func (r *bootstrapRevocationRaceRepository) AcknowledgeExperience(context.Context, string, string, string, *string) error {
	return nil
}

func (r *bootstrapRevocationRaceRepository) Revoke(_ context.Context, _ string) error {
	now := time.Now().UTC()
	r.stored.RevokedAt = &now
	return nil
}

func (r *bootstrapRevocationRaceRepository) TouchLastSeen(context.Context, string) error {
	if r.stored.RevokedAt != nil {
		return gorm.ErrRecordNotFound
	}
	now := time.Now().UTC()
	r.stored.LastSeenAt = &now
	return nil
}

func (r *bootstrapRevocationRaceRepository) FindByPairingCodeDigest(string) (*models.DesktopTerminal, error) {
	snapshot := r.stored
	now := time.Now().UTC()
	r.stored.RevokedAt = &now
	return &snapshot, nil
}

func (r *bootstrapRevocationRaceRepository) Update(terminal *models.DesktopTerminal) error {
	r.stored = *terminal
	return nil
}

func TestDesktopTerminalService_BootstrapDoesNotRestoreConcurrentRevocation(t *testing.T) {
	t.Setenv("JWT_SECRET", "bootstrap-stale-row-test-secret-012345")
	pairingCode := "23456789AB"
	hash, err := bcrypt.GenerateFromPassword([]byte(pairingCode), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo := &bootstrapRevocationRaceRepository{stored: models.DesktopTerminal{
		ID:            "terminal-a",
		UnitID:        "unit-a",
		Kind:          models.DesktopTerminalKindKiosk,
		DefaultLocale: "en",
		SecretHash:    string(hash),
	}}
	service := NewDesktopTerminalService(repo, nil, nil)

	token, _, _, _, _, _, _, err := service.Bootstrap(pairingCode)
	if err != nil {
		t.Fatalf("bootstrap after concurrent revoke: %v", err)
	}
	if token == "" {
		t.Fatal("bootstrap did not issue its already-authorized token")
	}
	if repo.stored.RevokedAt == nil || repo.stored.LastSeenAt != nil {
		t.Fatalf("bootstrap restored stale terminal snapshot after revocation: %#v", repo.stored)
	}
}
