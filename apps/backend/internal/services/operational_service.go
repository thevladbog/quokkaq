package services

import (
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// OperationalService coordinates unit freeze flags and EOD/statistics pipeline state.
type OperationalService struct {
	opRepo   repository.OperationalStateRepository
	unitRepo repository.UnitRepository
	refresh  *StatisticsRefreshService

	// eodClaimMu maps operational unit_id (URL param) to a mutex guarding the
	// Get → ReconcileInProgress check → Upsert claim before starting CompleteEODPipeline's goroutine.
	eodClaimMu sync.Map // string -> *sync.Mutex
}

func NewOperationalService(
	opRepo repository.OperationalStateRepository,
	unitRepo repository.UnitRepository,
	refresh *StatisticsRefreshService,
) *OperationalService {
	return &OperationalService{opRepo: opRepo, unitRepo: unitRepo, refresh: refresh}
}

func (s *OperationalService) eodClaimMutex(unitID string) *sync.Mutex {
	v, _ := s.eodClaimMu.LoadOrStore(unitID, new(sync.Mutex))
	return v.(*sync.Mutex)
}

func newDefaultUnitOperationalState(unitID string) *models.UnitOperationalState {
	return &models.UnitOperationalState{
		UnitID:                unitID,
		Phase:                 "idle",
		KioskFrozen:           false,
		CounterLoginBlocked:   false,
		StatisticsQuiet:       false,
		ReconcileInProgress:   false,
		ReconcileProgressNote: "",
	}
}

// getOperationalStateForRead ensures a persisted unit_operational_states row exists for unitID
// (subdivision scope), then loads it. Used for kiosk/admin reads on subdivisions that never
// had an operational row written yet.
func (s *OperationalService) getOperationalStateForRead(unitID string) (*models.UnitOperationalState, error) {
	if err := s.opRepo.EnsureRow(unitID); err != nil {
		return nil, err
	}
	st, err := s.opRepo.Get(unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			def := newDefaultUnitOperationalState(unitID)
			if uerr := s.opRepo.Upsert(def); uerr != nil {
				return nil, uerr
			}
			return s.opRepo.Get(unitID)
		}
		return nil, err
	}
	return st, nil
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
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		return nil, err
	}
	return &models.UnitOperationsPublic{
		KioskFrozen:         st.KioskFrozen,
		CounterLoginBlocked: st.CounterLoginBlocked,
		Phase:               st.Phase,
	}, nil
}

func (s *OperationalService) IsKioskFrozen(unitID string) (bool, error) {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return false, err
	}
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		return false, err
	}
	return st.KioskFrozen, nil
}

func (s *OperationalService) IsCounterLoginBlocked(unitID string) (bool, error) {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return false, err
	}
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		return false, err
	}
	return st.CounterLoginBlocked, nil
}

// WakeStatisticsIfQuiet clears statistics quiet flag after new activity.
func (s *OperationalService) WakeStatisticsIfQuiet(unitID string) {
	subID, err := s.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return
	}
	st, err := s.getOperationalStateForRead(subID)
	if err != nil || !st.StatisticsQuiet {
		return
	}
	st.StatisticsQuiet = false
	if st.Phase == "quiet" {
		st.Phase = "idle"
	}
	if err := s.opRepo.Upsert(st); err != nil {
		log.Printf("WakeStatisticsIfQuiet Upsert(subdivisionID=%q unitID=%q): %v", subID, unitID, err)
	}
}

// BeginEODFreeze sets admission locks before EOD transaction.
func (s *OperationalService) BeginEODFreeze(subdivisionID string) error {
	subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if err != nil {
		return err
	}
	st, err := s.getOperationalStateForRead(subID)
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
	subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if err != nil {
		return
	}
	st, err := s.getOperationalStateForRead(subID)
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
	subID, resErr := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if resErr != nil {
		log.Printf("eod pipeline: resolve subdivision %s: %v", subdivisionID, resErr)
		return
	}
	claimMu := s.eodClaimMutex(subID)
	claimMu.Lock()
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		claimMu.Unlock()
		log.Printf("eod pipeline: get state %s: %v", subID, err)
		s.AbortEODFreeze(subID)
		return
	}
	if st.ReconcileInProgress {
		claimMu.Unlock()
		return
	}
	now := time.Now().UTC()
	st.Phase = "reconciling"
	st.ReconcileInProgress = true
	st.ReconcileProgressNote = "rollup pending"
	st.LastEODAt = &now
	if err := s.opRepo.Upsert(st); err != nil {
		claimMu.Unlock()
		log.Printf("eod pipeline: begin reconcile %s: %v", subdivisionID, err)
		s.AbortEODFreeze(subID)
		return
	}
	claimMu.Unlock()

	go func() {
		var rollupErr error
		u, err := s.unitRepo.FindByIDLight(subID)
		if err != nil {
			log.Printf("eod pipeline: unit %s: %v", subID, err)
			s.AbortEODFreeze(subID)
			return
		}
		loc, lerr := time.LoadLocation(strings.TrimSpace(u.Timezone))
		if lerr != nil || loc == nil {
			loc = time.UTC
		}
		nowLocal := time.Now().In(loc)
		yesterday := nowLocal.AddDate(0, 0, -1).Format("2006-01-02")
		today := nowLocal.Format("2006-01-02")

		if stNote, gerr := s.getOperationalStateForRead(subID); gerr == nil && stNote != nil {
			stNote.ReconcileProgressNote = "rollup " + yesterday + "+" + today
			_ = s.opRepo.Upsert(stNote)
		}

		for _, day := range []string{yesterday, today} {
			if e := s.refresh.RollupUnitDay(subID, day); e != nil && rollupErr == nil {
				rollupErr = e
			}
		}
		st2, rerr := s.getOperationalStateForRead(subID)
		if rerr != nil {
			log.Printf("eod pipeline: finalize read state %s: %v", subID, rerr)
			s.AbortEODFreeze(subID)
			return
		}
		if st2 == nil {
			log.Printf("eod pipeline: finalize missing state row %s", subID)
			s.AbortEODFreeze(subID)
			return
		}
		st2.ReconcileInProgress = false
		st2.KioskFrozen = false
		st2.CounterLoginBlocked = false
		st2.StatisticsQuiet = true
		st2.Phase = "quiet"
		tr := time.Now().UTC()
		st2.LastReconcileAt = &tr
		if rollupErr != nil {
			msg := rollupErr.Error()
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
	subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if err != nil {
		return nil, err
	}
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		return nil, err
	}
	return &OperationsStatusDTO{
		UnitID:                subID,
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
	subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if err != nil {
		return err
	}
	st, err := s.getOperationalStateForRead(subID)
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
	subID, err := s.ResolveSubdivisionForOperationalState(subdivisionID)
	if err != nil {
		return err
	}
	st, err := s.getOperationalStateForRead(subID)
	if err != nil {
		return err
	}
	st.StatisticsQuiet = false
	if st.Phase == "quiet" {
		st.Phase = "idle"
	}
	return s.opRepo.Upsert(st)
}
