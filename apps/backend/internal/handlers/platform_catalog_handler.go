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

// ListCatalogItems godoc
// @Summary      List catalog items (platform)
// @Description  Paginated platform catalog nomenclature for invoice line presets. Each item may include an embedded subscription plan. Default page size 50; maximum 200 (enforced server-side).
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        limit   query int false "Page size (max 200)" default(50)
// @Param        offset  query int false "Zero-based row offset" default(0)
// @Success      200     {object}  platformListResponse[models.CatalogItem]
// @Failure      401     {string}  string "Unauthorized"
// @Failure      403     {string}  string "Forbidden"
// @Failure      500     {string}  string "Internal server error"
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
// @Summary      Get catalog item by ID (platform)
// @Description  Returns one catalog item by ID, including linked subscription plan when subscriptionPlanId is set.
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Catalog item ID (UUID)"
// @Success      200  {object}  models.CatalogItem
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal server error"
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
// @Summary      Create catalog item (platform)
// @Description  Creates a catalog row. Field name is required. Empty printName defaults to name; empty unit defaults to шт; empty currency defaults to RUB. Optional subscriptionPlanId must reference an existing plan or the request fails with 400.
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      models.CatalogItemCreateRequest  true  "New catalog item"
// @Success      201   {object}  models.CatalogItem
// @Failure      400   {string}  string "Bad request (invalid JSON, missing name, or unknown subscriptionPlanId)"
// @Failure      401   {string}  string "Unauthorized"
// @Failure      403   {string}  string "Forbidden"
// @Failure      500   {string}  string "Internal server error"
// @Router       /platform/catalog-items [post]
func (h *PlatformHandler) CreateCatalogItem(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var body models.CatalogItemCreateRequest
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
	out, err := h.catalogRepo.FindByID(item.ID)
	if err != nil {
		log.Printf("CreateCatalogItem FindByID after create: %v", err)
		RespondJSONWithStatus(w, http.StatusCreated, item)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, out)
}

// PatchCatalogItem godoc
// @Summary      Patch catalog item (platform)
// @Description  Partial update: only fields present in the JSON body are changed. Omit keys to leave values unchanged. Whitespace-only subscriptionPlanId clears the link; a non-empty value must reference an existing plan.
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                         true  "Catalog item ID (UUID)"
// @Param        body  body      models.CatalogItemPatchRequest true  "Fields to update"
// @Success      200   {object}  models.CatalogItem
// @Failure      400   {string}  string "Bad request (invalid JSON or unknown subscriptionPlanId)"
// @Failure      401   {string}  string "Unauthorized"
// @Failure      403   {string}  string "Forbidden"
// @Failure      404   {string}  string "Not found"
// @Failure      500   {string}  string "Internal server error"
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
	var body models.CatalogItemPatchRequest
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
	out, err := h.catalogRepo.FindByID(id)
	if err != nil {
		log.Printf("PatchCatalogItem FindByID after update: %v", err)
		RespondJSON(w, item)
		return
	}
	RespondJSON(w, out)
}

// DeleteCatalogItem godoc
// @Summary      Delete catalog item (platform)
// @Description  Deletes a catalog item by ID after an existence check. If no row matches, responds with 404 (no silent success).
// @Tags         platform
// @Security     BearerAuth
// @Param        id   path  string  true  "Catalog item ID (UUID)"
// @Success      204  "No Content"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal server error"
// @Router       /platform/catalog-items/{id} [delete]
func (h *PlatformHandler) DeleteCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	_, err := h.catalogRepo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		log.Printf("DeleteCatalogItem FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.catalogRepo.Delete(id); err != nil {
		log.Printf("DeleteCatalogItem: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
