package services

import (
	"encoding/json"
	"sort"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

func writeUnitClientHistoryTx(
	tx *gorm.DB,
	histRepo repository.UnitClientHistoryRepository,
	unitID, clientID string,
	actorUserID *string,
	action string,
	payload map[string]interface{},
) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	row := &models.UnitClientHistory{
		UnitID:       unitID,
		UnitClientID: clientID,
		ActorUserID:  actorUserID,
		Action:       action,
		Payload:      b,
	}
	return histRepo.CreateTx(tx, row)
}

func diffSortedTagIDSetsForClient(fromSorted, toSorted []string) (addedIDs, removedIDs []string) {
	fromSet := make(map[string]struct{}, len(fromSorted))
	for _, id := range fromSorted {
		fromSet[id] = struct{}{}
	}
	toSet := make(map[string]struct{}, len(toSorted))
	for _, id := range toSorted {
		toSet[id] = struct{}{}
	}
	for id := range toSet {
		if _, ok := fromSet[id]; !ok {
			addedIDs = append(addedIDs, id)
		}
	}
	for id := range fromSet {
		if _, ok := toSet[id]; !ok {
			removedIDs = append(removedIDs, id)
		}
	}
	sort.Strings(addedIDs)
	sort.Strings(removedIDs)
	return addedIDs, removedIDs
}

func visitorTagLabelsForClientAuditTx(
	tx *gorm.DB,
	repo repository.VisitorTagDefinitionRepository,
	unitID string,
	ids []string,
) []string {
	if len(ids) == 0 {
		return nil
	}
	rows, err := repo.ListByIDsInUnitTx(tx, unitID, ids)
	if err != nil {
		out := append([]string(nil), ids...)
		sort.Strings(out)
		return out
	}
	byID := make(map[string]string, len(rows))
	for i := range rows {
		lab := rows[i].Label
		if lab == "" {
			lab = rows[i].ID
		}
		byID[rows[i].ID] = lab
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if lab, ok := byID[id]; ok {
			out = append(out, lab)
		} else {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}
