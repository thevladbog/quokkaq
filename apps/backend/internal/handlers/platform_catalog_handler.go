package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type catalogItemCreateBody struct {
	Name               string   `json:"name"`
	PrintName          string   `json:"printName"`
	Unit               string   `json:"unit"`
	Article            string   `json:"article"`
	DefaultPriceMinor  int64    `json:"defaultPriceMinor"`
	Currency           string   `json:"currency"`
	VatExempt          bool     `json:"vatExempt"`
	VatRatePercent     *float64 `json:"vatRatePercent"`
	SubscriptionPlanID *string  `json:"subscriptionPlanId"`
	IsActive           *bool    `json:"isActive"`
}

type catalogItemPatchBody struct {
	Name               *string  `json:"name"`
	PrintName          *string  `json:"printName"`
	Unit               *string  `json:"unit"`
	Article            *string  `json:"article"`
	DefaultPriceMinor  *int64   `json:"defaultPriceMinor"`
	Currency           *string  `json:"currency"`
	VatExempt          *bool    `json:"vatExempt"`
	VatRatePercent     *float64 `json:"vatRatePercent"`
	SubscriptionPlanID *string  `json:"subscriptionPlanId"`
	IsActive           *bool    `json:"isActive"`
}

// ListCatalogItems godoc
// @Router       /platform/catalog-items [get]
func (h *PlatformHandler) ListCatalogItems(w http.ResponseWriter, r *http.Request) {
	limit, offset := platformParseCatalogLimitOffset(r)
	items, total, err := h.catalogRepo.ListAll(limit, offset)
	if err != nil {
		log.Printf("ListCatalogItems: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, platformListResponse[*models.CatalogItem]{
		Items:  toCatalogItemPtrSlice(items),
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func toCatalogItemPtrSlice(in []models.CatalogItem) []*models.CatalogItem {
	out := make([]*models.CatalogItem, len(in))
	for i := range in {
		it := in[i]
		out[i] = &it
	}
	return out
}

// GetCatalogItem godoc
// @Router       /platform/catalog-items/{id} [get]
func (h *PlatformHandler) GetCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	item, err := h.catalogRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("GetCatalogItem: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	RespondJSON(w, item)
}

// CreateCatalogItem godoc
// @Router       /platform/catalog-items [post]
func (h *PlatformHandler) CreateCatalogItem(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var body catalogItemCreateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	printName := strings.TrimSpace(body.PrintName)
	if printName == "" {
		printName = body.Name
	}
	unit := strings.TrimSpace(body.Unit)
	if unit == "" {
		unit = "шт"
	}
	cur := strings.TrimSpace(body.Currency)
	if cur == "" {
		cur = "RUB"
	}
	vatRate := 0.0
	if body.VatRatePercent != nil {
		vatRate = *body.VatRatePercent
	}
	active := true
	if body.IsActive != nil {
		active = *body.IsActive
	}
	if body.SubscriptionPlanID != nil {
		s := strings.TrimSpace(*body.SubscriptionPlanID)
		if s == "" {
			body.SubscriptionPlanID = nil
		} else {
			body.SubscriptionPlanID = &s
		}
	}
	if body.SubscriptionPlanID != nil {
		if _, err := h.subscriptionRepo.FindPlanByID(*body.SubscriptionPlanID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Unknown subscriptionPlanId", http.StatusBadRequest)
				return
			}
			log.Printf("CreateCatalogItem FindPlanByID: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	item := &models.CatalogItem{
		Name:               body.Name,
		PrintName:          printName,
		Unit:               unit,
		Article:            strings.TrimSpace(body.Article),
		DefaultPriceMinor:  body.DefaultPriceMinor,
		Currency:           cur,
		VatExempt:          body.VatExempt,
		VatRatePercent:     vatRate,
		SubscriptionPlanID: body.SubscriptionPlanID,
		IsActive:           active,
	}
	if err := h.catalogRepo.Create(item); err != nil {
		log.Printf("CreateCatalogItem: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out, _ := h.catalogRepo.FindByID(item.ID)
	RespondJSONWithStatus(w, http.StatusCreated, out)
}

// PatchCatalogItem godoc
// @Router       /platform/catalog-items/{id} [patch]
func (h *PlatformHandler) PatchCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	item, err := h.catalogRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("PatchCatalogItem FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var body catalogItemPatchBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Name != nil && strings.TrimSpace(*body.Name) != "" {
		item.Name = strings.TrimSpace(*body.Name)
	}
	if body.PrintName != nil {
		item.PrintName = strings.TrimSpace(*body.PrintName)
	}
	if body.Unit != nil && strings.TrimSpace(*body.Unit) != "" {
		item.Unit = strings.TrimSpace(*body.Unit)
	}
	if body.Article != nil {
		item.Article = strings.TrimSpace(*body.Article)
	}
	if body.DefaultPriceMinor != nil {
		item.DefaultPriceMinor = *body.DefaultPriceMinor
	}
	if body.Currency != nil && strings.TrimSpace(*body.Currency) != "" {
		item.Currency = strings.TrimSpace(*body.Currency)
	}
	if body.VatExempt != nil {
		item.VatExempt = *body.VatExempt
	}
	if body.VatRatePercent != nil {
		item.VatRatePercent = *body.VatRatePercent
	}
	if body.SubscriptionPlanID != nil {
		s := strings.TrimSpace(*body.SubscriptionPlanID)
		if s == "" {
			item.SubscriptionPlanID = nil
		} else {
			if _, err := h.subscriptionRepo.FindPlanByID(s); err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					http.Error(w, "Unknown subscriptionPlanId", http.StatusBadRequest)
					return
				}
				log.Printf("PatchCatalogItem FindPlanByID: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			item.SubscriptionPlanID = &s
		}
	}
	if body.IsActive != nil {
		item.IsActive = *body.IsActive
	}
	if err := h.catalogRepo.Update(item); err != nil {
		log.Printf("PatchCatalogItem: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	out, _ := h.catalogRepo.FindByID(id)
	RespondJSON(w, out)
}

// DeleteCatalogItem godoc
// @Router       /platform/catalog-items/{id} [delete]
func (h *PlatformHandler) DeleteCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if err := h.catalogRepo.Delete(id); err != nil {
		log.Printf("DeleteCatalogItem: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
