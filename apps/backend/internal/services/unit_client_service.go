package services

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// ErrInvalidUnitClientListCursor is returned when the list cursor query parameter cannot be decoded.
var ErrInvalidUnitClientListCursor = errors.New("invalid client list cursor")

// UnitClientListResponse is paginated unit clients for GET .../clients.
type UnitClientListResponse struct {
	Items      []models.UnitClient `json:"items"`
	NextCursor *string             `json:"nextCursor,omitempty"`
}

// UnitClientService is the visitor directory for a unit (search, anonymous bootstrap, CRM list/patch).
type UnitClientService interface {
	EnsureAnonymousClient(unitID string) error
	EnsureAnonymousClientTx(tx *gorm.DB, unitID string) error
	SearchForUnit(unitID, query string) ([]models.UnitClient, error)
	GetByIDInUnit(unitID, clientID string) (*models.UnitClient, error)
	ListForUnit(unitID, q string, tagDefinitionIDs []string, limit int, cursor *string) (*UnitClientListResponse, error)
	GetByIDInUnitWithDefinitions(unitID, clientID string) (*models.UnitClient, error)
	PatchClient(unitID, clientID string, firstName, lastName, phone *string, tagDefinitionIDs *[]string, actorUserID *string) error
	ListHistoryForClient(unitID, clientID string, limit int, cursor *string) (*UnitClientHistoryListResponse, error)
}

// UnitClientHistoryItem is one audit row for the CRM client history API.
type UnitClientHistoryItem struct {
	ID           string                 `json:"id"`
	UnitID       string                 `json:"unitId"`
	UnitClientID string                 `json:"unitClientId"`
	ActorUserID  *string                `json:"actorUserId,omitempty"`
	ActorName    *string                `json:"actorName,omitempty"`
	Action       string                 `json:"action"`
	Payload      map[string]interface{} `json:"payload"`
	CreatedAt    time.Time              `json:"createdAt"`
}

// UnitClientHistoryListResponse is paginated client profile/tag history.
type UnitClientHistoryListResponse struct {
	Items      []UnitClientHistoryItem `json:"items"`
	NextCursor *string                 `json:"nextCursor,omitempty"`
}

type unitClientService struct {
	repo       repository.UnitClientRepository
	tagDefRepo repository.VisitorTagDefinitionRepository
	histRepo   repository.UnitClientHistoryRepository
	db         *gorm.DB
}

func NewUnitClientService(repo repository.UnitClientRepository, tagDefRepo repository.VisitorTagDefinitionRepository, histRepo repository.UnitClientHistoryRepository, db *gorm.DB) UnitClientService {
	return &unitClientService{repo: repo, tagDefRepo: tagDefRepo, histRepo: histRepo, db: db}
}

func (s *unitClientService) EnsureAnonymousClient(unitID string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		return s.EnsureAnonymousClientTx(tx, unitID)
	})
}

func (s *unitClientService) EnsureAnonymousClientTx(tx *gorm.DB, unitID string) error {
	_, err := s.repo.EnsureAnonymousForUnitTx(tx, unitID)
	return err
}

func (s *unitClientService) SearchForUnit(unitID, query string) ([]models.UnitClient, error) {
	return s.repo.SearchNonAnonymous(unitID, query, phoneutil.DefaultRegion(), 20)
}

func (s *unitClientService) GetByIDInUnit(unitID, clientID string) (*models.UnitClient, error) {
	c, err := s.repo.GetByID(clientID)
	if err != nil {
		return nil, err
	}
	if c.UnitID != unitID {
		return nil, gorm.ErrRecordNotFound
	}
	return c, nil
}

func decodeUnitClientCursor(s string) (time.Time, string, error) {
	raw, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%w: %v", ErrInvalidUnitClientListCursor, err)
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", ErrInvalidUnitClientListCursor
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%w: %v", ErrInvalidUnitClientListCursor, err)
	}
	id := strings.TrimSpace(parts[1])
	if id == "" {
		return time.Time{}, "", ErrInvalidUnitClientListCursor
	}
	return ts, id, nil
}

func encodeUnitClientCursor(t time.Time, id string) string {
	raw := t.Format(time.RFC3339Nano) + "|" + id
	return base64.URLEncoding.EncodeToString([]byte(raw))
}

func (s *unitClientService) ListForUnit(unitID, q string, tagDefinitionIDs []string, limit int, cursor *string) (*UnitClientListResponse, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	fetch := limit + 1
	var beforeTime *time.Time
	var beforeID *string
	if cursor != nil && strings.TrimSpace(*cursor) != "" {
		ts, id, err := decodeUnitClientCursor(strings.TrimSpace(*cursor))
		if err != nil {
			return nil, err
		}
		beforeTime = &ts
		beforeID = &id
	}
	rows, err := s.repo.ListNonAnonymousPaged(unitID, q, tagDefinitionIDs, phoneutil.DefaultRegion(), fetch, beforeTime, beforeID)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	resp := &UnitClientListResponse{Items: rows}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		nc := encodeUnitClientCursor(last.UpdatedAt, last.ID)
		resp.NextCursor = &nc
	}
	return resp, nil
}

func (s *unitClientService) GetByIDInUnitWithDefinitions(unitID, clientID string) (*models.UnitClient, error) {
	return s.repo.GetByIDInUnitWithDefinitions(unitID, clientID)
}

func (s *unitClientService) ListHistoryForClient(unitID, clientID string, limit int, cursor *string) (*UnitClientHistoryListResponse, error) {
	c, err := s.repo.GetByID(clientID)
	if err != nil {
		return nil, err
	}
	if c.UnitID != unitID || c.IsAnonymous {
		return nil, gorm.ErrRecordNotFound
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	var beforeTime *time.Time
	var beforeID *string
	if cursor != nil {
		raw := strings.TrimSpace(*cursor)
		if raw != "" {
			t, id, err := repository.DecodeUnitClientHistoryCursor(raw)
			if err != nil {
				return nil, err
			}
			beforeTime = &t
			beforeID = &id
		}
	}
	fetchLimit := limit + 1
	rows, err := s.histRepo.ListByUnitClientPaged(unitID, clientID, fetchLimit, beforeTime, beforeID)
	if err != nil {
		return nil, err
	}
	hasNextPage := len(rows) > limit
	displayRows := rows
	if hasNextPage {
		displayRows = rows[:limit]
	}
	items := make([]UnitClientHistoryItem, 0, len(displayRows))
	for _, r := range displayRows {
		var payload map[string]interface{}
		if len(r.Payload) > 0 {
			if err := json.Unmarshal(r.Payload, &payload); err != nil {
				payload = nil
			}
		}
		if payload == nil {
			payload = map[string]interface{}{}
		}
		var actorName *string
		if r.ActorName.Valid && strings.TrimSpace(r.ActorName.String) != "" {
			n := strings.TrimSpace(r.ActorName.String)
			actorName = &n
		}
		items = append(items, UnitClientHistoryItem{
			ID:           r.ID,
			UnitID:       r.UnitID,
			UnitClientID: r.UnitClientID,
			ActorUserID:  r.ActorUserID,
			ActorName:    actorName,
			Action:       r.Action,
			Payload:      payload,
			CreatedAt:    r.CreatedAt,
		})
	}
	resp := &UnitClientHistoryListResponse{Items: items}
	if hasNextPage {
		last := displayRows[len(displayRows)-1]
		nc := repository.EncodeUnitClientHistoryCursor(last.CreatedAt, last.ID)
		resp.NextCursor = &nc
	}
	return resp, nil
}

func (s *unitClientService) PatchClient(unitID, clientID string, firstName, lastName, phone *string, tagDefinitionIDs *[]string, actorUserID *string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		c, err := s.repo.GetByIDTx(tx, clientID)
		if err != nil {
			return err
		}
		if c.UnitID != unitID || c.IsAnonymous {
			return gorm.ErrRecordNotFound
		}

		profileChanges := make(map[string]interface{})

		newFirst := c.FirstName
		newLast := c.LastName
		if firstName != nil {
			newFirst = strings.TrimSpace(*firstName)
		}
		if lastName != nil {
			newLast = strings.TrimSpace(*lastName)
		}
		if firstName != nil || lastName != nil {
			if newFirst == "" && newLast == "" {
				return errors.New("first and last name cannot both be empty")
			}
			if firstName != nil && newFirst != c.FirstName {
				profileChanges["firstName"] = map[string]string{"from": c.FirstName, "to": newFirst}
			}
			if lastName != nil && newLast != c.LastName {
				profileChanges["lastName"] = map[string]string{"from": c.LastName, "to": newLast}
			}
			if err := s.repo.UpdateNamesTx(tx, clientID, newFirst, newLast); err != nil {
				return err
			}
		}

		if phone != nil {
			raw := strings.TrimSpace(*phone)
			var e164 *string
			if raw == "" {
				e164 = nil
			} else {
				norm, err := phoneutil.ParseAndNormalize(raw, phoneutil.DefaultRegion())
				if err != nil {
					return fmt.Errorf("%w: %v", phoneutil.ErrInvalidPhone, err)
				}
				e164 = &norm
			}
			if !phoneE164PtrEqual(c.PhoneE164, e164) {
				profileChanges["phoneE164"] = map[string]interface{}{
					"from": phoneE164PtrToJSON(c.PhoneE164),
					"to":   phoneE164PtrToJSON(e164),
				}
			}
			if err := s.repo.UpdateClientPhoneE164Tx(tx, unitID, clientID, e164); err != nil {
				return err
			}
		}

		if tagDefinitionIDs != nil {
			fromIDs, err := s.repo.ListTagDefinitionIDsByClientTx(tx, clientID)
			if err != nil {
				return err
			}
			slices.Sort(fromIDs)

			trimmed := make([]string, 0, len(*tagDefinitionIDs))
			seen := make(map[string]struct{})
			for _, id := range *tagDefinitionIDs {
				id = strings.TrimSpace(id)
				if id == "" {
					return errors.New("tagDefinitionIds must not contain empty strings")
				}
				if _, ok := seen[id]; ok {
					continue
				}
				seen[id] = struct{}{}
				trimmed = append(trimmed, id)
			}
			slices.Sort(trimmed)

			if len(trimmed) > 0 {
				n, err := s.tagDefRepo.CountInUnitWithIDs(unitID, trimmed)
				if err != nil {
					return err
				}
				if n != int64(len(trimmed)) {
					return errors.New("one or more tag ids are invalid for this unit")
				}
			}
			if !slices.Equal(fromIDs, trimmed) {
				addedIDs, removedIDs := diffSortedTagIDSetsForClient(fromIDs, trimmed)
				addedLabels := visitorTagLabelsForClientAuditTx(tx, s.tagDefRepo, unitID, addedIDs)
				removedLabels := visitorTagLabelsForClientAuditTx(tx, s.tagDefRepo, unitID, removedIDs)
				tagPayload := map[string]interface{}{
					"source":           "crm_profile",
					"fromTagIds":       fromIDs,
					"toTagIds":         trimmed,
					"addedTagIds":      addedIDs,
					"removedTagIds":    removedIDs,
					"addedTagLabels":   addedLabels,
					"removedTagLabels": removedLabels,
				}
				if err := writeUnitClientHistoryTx(tx, s.histRepo, unitID, clientID, actorUserID, models.UnitClientHistoryActionTagsUpdated, tagPayload); err != nil {
					return err
				}
			}
			if err := s.repo.ReplaceClientTagAssignmentsTx(tx, unitID, clientID, trimmed); err != nil {
				return err
			}
		}

		if len(profileChanges) > 0 {
			profPayload := map[string]interface{}{
				"source":  "crm_profile",
				"changes": profileChanges,
			}
			if err := writeUnitClientHistoryTx(tx, s.histRepo, unitID, clientID, actorUserID, models.UnitClientHistoryActionProfileUpdated, profPayload); err != nil {
				return err
			}
		}
		return nil
	})
}

func phoneE164PtrEqual(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return strings.TrimSpace(*a) == strings.TrimSpace(*b)
}

func phoneE164PtrToJSON(p *string) interface{} {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil
	}
	return strings.TrimSpace(*p)
}
