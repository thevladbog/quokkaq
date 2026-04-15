package services

import (
	"log"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// OperationalService coordinates unit freeze flags and EOD/statistics pipeline state.
type OperationalService struct {
	opRepo   repository.OperationalStateRepository
	unitRepo repository.UnitRepository
	refresh  *StatisticsRefreshService
}

func NewOperationalService(
	opRepo repository.OperationalStateRepository,
	unitRepo repository.UnitRepository,
	refresh *StatisticsRefreshService,
) *OperationalService {
	return &OperationalService{opRepo: opRepo, unitRepo: unitRepo, refresh: refresh}
}

// ResolveSubdivisionForOperationalState returns the subdivision id used for operational_state rows.
func (s *OperationalService) ResolveSubdivisionForOperationalState(unitID string) (string, error) {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return "", err
	}
	if u.Kind == models.UnitKindServiceZone && u.ParentID != nil && strings.TrimSpace(*u.ParentID) != "" {
		return strings.TrimSpace(*u.ParentID), nil
	}
	return u.ID, nil
}

func (s *OperationalService) GetPublicSnapshot(unitID string) (*models.UnitOperationsPublic, error) {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return nil, err
	}
	st, err := s.opRepo.Get(subID)
	if err != nil {
		return nil, err
	}
	return &models.UnitOperationsPublic{
		KioskFrozen:         st.KioskFrozen,
		CounterLoginBlocked: st.CounterLoginBlocked,
		Phase:               st.Phase,
	}, nil
}

func (s *OperationalService) IsKioskFrozen(unitID string) bool {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return false
	}
	st, err := s.opRepo.Get(subID)
	if err != nil {
		return false
	}
	return st.KioskFrozen
}

func (s *OperationalService) IsCounterLoginBlocked(unitID string) bool {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return false
	}
	st, err := s.opRepo.Get(subID)
	if err != nil {
		return false
	}
	return st.CounterLoginBlocked
}

// WakeStatisticsIfQuiet clears statistics quiet flag after new activity.
func (s *OperationalService) WakeStatisticsIfQuiet(unitID string) {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return
	}
	st, err := s.opRepo.Get(subID)
	if err != nil || !st.StatisticsQuiet {
		return
	}
	st.StatisticsQuiet = false
	if st.Phase == "quiet" {
		st.Phase = "idle"
	}
	_ = s.opRepo.Upsert(st)
}

// BeginEODFreeze sets admission locks before EOD transaction.
func (s *OperationalService) BeginEODFreeze(subdivisionID string) error {
	_ = s.opRepo.EnsureRow(subdivisionID)
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		return err
	}
	st.Phase = "freezing"
	st.KioskFrozen = true
	st.CounterLoginBlocked = true
	return s.opRepo.Upsert(st)
}

// AbortEODFreeze clears locks after failed EOD.
func (s *OperationalService) AbortEODFreeze(subdivisionID string) {
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		return
	}
	st.Phase = "idle"
	st.KioskFrozen = false
	st.CounterLoginBlocked = false
	st.ReconcileInProgress = false
	_ = s.opRepo.Upsert(st)
}

// CompleteEODPipeline runs statistics warehouse rollup for the subdivision then unlocks and sets quiet mode.
// It rolls up yesterday and today in local time: EOD finalization sets completed_at to "now", which falls on
// today's bucket; yesterday covers late updates to the previous calendar day (same as RefreshRecentDays).
func (s *OperationalService) CompleteEODPipeline(subdivisionID string) {
	go func() {
		u, err := s.unitRepo.FindByIDLight(subdivisionID)
		if err != nil {
			log.Printf("eod pipeline: unit %s: %v", subdivisionID, err)
			s.AbortEODFreeze(subdivisionID)
			return
		}
		subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
		if err != nil {
			log.Printf("eod pipeline: resolve subdivision %s: %v", subdivisionID, err)
			s.AbortEODFreeze(subdivisionID)
			return
		}
		loc, lerr := time.LoadLocation(strings.TrimSpace(u.Timezone))
		if lerr != nil || loc == nil {
			loc = time.UTC
		}
		nowLocal := time.Now().In(loc)
		yesterday := nowLocal.AddDate(0, 0, -1).Format("2006-01-02")
		today := nowLocal.Format("2006-01-02")

		st, _ := s.opRepo.Get(subdivisionID)
		now := time.Now().UTC()
		st.Phase = "reconciling"
		st.ReconcileInProgress = true
		st.ReconcileProgressNote = "rollup " + yesterday + "+" + today
		st.LastEODAt = &now
		_ = s.opRepo.Upsert(st)

		for _, day := range []string{yesterday, today} {
			if e := s.refresh.RollupUnitDay(subID, day); e != nil && err == nil {
				err = e
			}
		}
		st2, _ := s.opRepo.Get(subdivisionID)
		st2.ReconcileInProgress = false
		st2.KioskFrozen = false
		st2.CounterLoginBlocked = false
		st2.StatisticsQuiet = true
		st2.Phase = "quiet"
		tr := time.Now().UTC()
		st2.LastReconcileAt = &tr
		if err != nil {
			msg := err.Error()
			st2.LastReconcileError = &msg
			st2.Phase = "error"
		} else {
			st2.LastReconcileError = nil
		}
		_ = s.opRepo.Upsert(st2)
	}()
}

// OperationsStatusDTO is returned by GET .../operations/status.
type OperationsStatusDTO struct {
	UnitID                string     `json:"unitId"`
	Phase                 string     `json:"phase"`
	KioskFrozen           bool       `json:"kioskFrozen"`
	CounterLoginBlocked   bool       `json:"counterLoginBlocked"`
	StatisticsQuiet       bool       `json:"statisticsQuiet"`
	ReconcileInProgress   bool       `json:"reconcileInProgress"`
	ReconcileProgressNote string     `json:"reconcileProgressNote,omitempty"`
	LastEODAt             *time.Time `json:"lastEodAt,omitempty"`
	LastReconcileAt       *time.Time `json:"lastReconcileAt,omitempty"`
	LastReconcileError    *string    `json:"lastReconcileError,omitempty"`
	StatisticsAsOf        *time.Time `json:"statisticsAsOf,omitempty"`
}

func (s *OperationalService) GetStatus(subdivisionID string) (*OperationsStatusDTO, error) {
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		return nil, err
	}
	return &OperationsStatusDTO{
		UnitID:                subdivisionID,
		Phase:                 st.Phase,
		KioskFrozen:           st.KioskFrozen,
		CounterLoginBlocked:   st.CounterLoginBlocked,
		StatisticsQuiet:       st.StatisticsQuiet,
		ReconcileInProgress:   st.ReconcileInProgress,
		ReconcileProgressNote: st.ReconcileProgressNote,
		LastEODAt:             st.LastEODAt,
		LastReconcileAt:       st.LastReconcileAt,
		LastReconcileError:    st.LastReconcileError,
		StatisticsAsOf:        st.StatisticsAsOf,
	}, nil
}

// EmergencyUnlockAll clears admission and reconcile flags (admin override).
func (s *OperationalService) EmergencyUnlockAll(subdivisionID string) error {
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		return err
	}
	st.KioskFrozen = false
	st.CounterLoginBlocked = false
	st.ReconcileInProgress = false
	st.ReconcileProgressNote = ""
	if st.Phase == "error" || st.Phase == "freezing" || st.Phase == "reconciling" {
		st.Phase = "idle"
	}
	return s.opRepo.Upsert(st)
}

func (s *OperationalService) ClearStatisticsQuiet(subdivisionID string) error {
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		return err
	}
	st.StatisticsQuiet = false
	if st.Phase == "quiet" {
		st.Phase = "idle"
	}
	return s.opRepo.Upsert(st)
}
