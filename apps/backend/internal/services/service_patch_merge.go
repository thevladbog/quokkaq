package services

import (
	"encoding/json"
	"fmt"

	"quokkaq-go-backend/internal/models"
)

// MergeServiceJSONPatch copies only keys present in raw (JSON object) onto dst.
// Used for PUT /services/:id so sparse bodies (e.g. grid-only updates) do not zero out name, prefix, etc.
func MergeServiceJSONPatch(dst *models.Service, raw map[string]json.RawMessage) error {
	for k, v := range raw {
		switch k {
		case "id", "children", "parent", "unit":
			continue
		case "unitId":
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("unitId: %w", err)
			}
			dst.UnitID = s
		case "parentId":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("parentId: %w", err)
			}
			dst.ParentID = p
		case "name":
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("name: %w", err)
			}
			dst.Name = s
		case "nameRu":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("nameRu: %w", err)
			}
			dst.NameRu = p
		case "nameEn":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("nameEn: %w", err)
			}
			dst.NameEn = p
		case "description":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("description: %w", err)
			}
			dst.Description = p
		case "descriptionRu":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("descriptionRu: %w", err)
			}
			dst.DescriptionRu = p
		case "descriptionEn":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("descriptionEn: %w", err)
			}
			dst.DescriptionEn = p
		case "imageUrl":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("imageUrl: %w", err)
			}
			dst.ImageUrl = p
		case "iconKey":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("iconKey: %w", err)
			}
			dst.IconKey = p
		case "backgroundColor":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("backgroundColor: %w", err)
			}
			dst.BackgroundColor = p
		case "textColor":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("textColor: %w", err)
			}
			dst.TextColor = p
		case "prefix":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("prefix: %w", err)
			}
			dst.Prefix = p
		case "numberSequence":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("numberSequence: %w", err)
			}
			dst.NumberSequence = p
		case "duration":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("duration: %w", err)
			}
			dst.Duration = p
		case "maxWaitingTime":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("maxWaitingTime: %w", err)
			}
			dst.MaxWaitingTime = p
		case "maxServiceTime":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("maxServiceTime: %w", err)
			}
			dst.MaxServiceTime = p
		case "prebook":
			if err := json.Unmarshal(v, &dst.Prebook); err != nil {
				return fmt.Errorf("prebook: %w", err)
			}
		case "calendarSlotKey":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("calendarSlotKey: %w", err)
			}
			dst.CalendarSlotKey = p
		case "offerIdentification":
			if err := json.Unmarshal(v, &dst.OfferIdentification); err != nil {
				return fmt.Errorf("offerIdentification: %w", err)
			}
			if dst.OfferIdentification {
				dst.IdentificationMode = models.IdentificationModePhone
			} else {
				dst.IdentificationMode = models.IdentificationModeNone
			}
		case "identificationMode":
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("identificationMode: %w", err)
			}
			if !models.IsValidIdentificationMode(s) {
				return fmt.Errorf("identificationMode: invalid value %q", s)
			}
			dst.IdentificationMode = s
			dst.OfferIdentification = s == models.IdentificationModePhone
		case "isLeaf":
			if err := json.Unmarshal(v, &dst.IsLeaf); err != nil {
				return fmt.Errorf("isLeaf: %w", err)
			}
		case "restrictedServiceZoneId":
			var p *string
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("restrictedServiceZoneId: %w", err)
			}
			dst.RestrictedServiceZoneID = p
		case "gridRow":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("gridRow: %w", err)
			}
			dst.GridRow = p
		case "gridCol":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("gridCol: %w", err)
			}
			dst.GridCol = p
		case "gridRowSpan":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("gridRowSpan: %w", err)
			}
			dst.GridRowSpan = p
		case "gridColSpan":
			var p *int
			if err := json.Unmarshal(v, &p); err != nil {
				return fmt.Errorf("gridColSpan: %w", err)
			}
			dst.GridColSpan = p
		case "sortOrder":
			if err := json.Unmarshal(v, &dst.SortOrder); err != nil {
				return fmt.Errorf("sortOrder: %w", err)
			}
		default:
			// Ignore unknown keys so generated clients can add read-only metadata without breaking updates.
			continue
		}
	}
	return nil
}
