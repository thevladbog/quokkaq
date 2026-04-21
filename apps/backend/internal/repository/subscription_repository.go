package repository

import (
	"errors"
	"sort"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type SubscriptionRepository interface {
	Create(subscription *models.Subscription) error
	FindByID(id string) (*models.Subscription, error)
	FindByCompanyID(companyID string) (*models.Subscription, error)
	Update(subscription *models.Subscription) error
	Delete(id string) error
	ListAllPaginated(limit, offset int) ([]models.Subscription, int64, error)
	GetActivePlans() ([]models.SubscriptionPlan, error)
	// GetActivePlansForTenant returns active public catalog plans plus any extra active plans by ID (e.g. tenant's non-public current plan).
	GetActivePlansForTenant(extraPlanIDs []string) ([]models.SubscriptionPlan, error)
	ListAllPlans() ([]models.SubscriptionPlan, error)
	FindPlanByID(id string) (*models.SubscriptionPlan, error)
	FindPlanByCode(code string) (*models.SubscriptionPlan, error)
	// FindFreePlan returns the first active public plan with is_free=true.
	// Returns nil (no error) when no free plan exists.
	FindFreePlan() (*models.SubscriptionPlan, error)
	CreatePlan(plan *models.SubscriptionPlan) error
	UpdatePlan(plan *models.SubscriptionPlan) error
}

type subscriptionRepository struct{}

func NewSubscriptionRepository() SubscriptionRepository {
	return &subscriptionRepository{}
}

func (r *subscriptionRepository) Create(subscription *models.Subscription) error {
	return database.DB.Create(subscription).Error
}

func (r *subscriptionRepository) FindByID(id string) (*models.Subscription, error) {
	var subscription models.Subscription
	err := database.DB.Preload("Plan").Preload("PendingPlan").Where("id = ?", id).First(&subscription).Error
	if err != nil {
		return nil, err
	}
	return &subscription, nil
}

func (r *subscriptionRepository) FindByCompanyID(companyID string) (*models.Subscription, error) {
	var subscription models.Subscription
	err := database.DB.Preload("Plan").Preload("PendingPlan").Where("company_id = ?", companyID).First(&subscription).Error
	if err != nil {
		return nil, err
	}
	return &subscription, nil
}

func (r *subscriptionRepository) Update(subscription *models.Subscription) error {
	return database.DB.Save(subscription).Error
}

func (r *subscriptionRepository) Delete(id string) error {
	return database.DB.Delete(&models.Subscription{}, "id = ?", id).Error
}

func (r *subscriptionRepository) GetActivePlans() ([]models.SubscriptionPlan, error) {
	var plans []models.SubscriptionPlan
	err := database.DB.Where("is_active = ? AND is_public = ?", true, true).
		Order("display_order ASC").
		Order("name ASC").
		Find(&plans).Error
	return plans, err
}

func (r *subscriptionRepository) GetActivePlansForTenant(extraPlanIDs []string) ([]models.SubscriptionPlan, error) {
	public, err := r.GetActivePlans()
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(public)+len(extraPlanIDs))
	for _, p := range public {
		seen[p.ID] = struct{}{}
	}
	var missing []string
	for _, raw := range extraPlanIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; !ok {
			missing = append(missing, id)
			seen[id] = struct{}{}
		}
	}
	if len(missing) == 0 {
		return public, nil
	}
	var extras []models.SubscriptionPlan
	err = database.DB.Where("is_active = ? AND id IN ?", true, missing).Find(&extras).Error
	if err != nil {
		return nil, err
	}
	out := append(append([]models.SubscriptionPlan{}, public...), extras...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].DisplayOrder != out[j].DisplayOrder {
			return out[i].DisplayOrder < out[j].DisplayOrder
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (r *subscriptionRepository) FindPlanByCode(code string) (*models.SubscriptionPlan, error) {
	var plan models.SubscriptionPlan
	err := database.DB.Where("code = ?", code).
		Where("is_active = ? AND is_public = ?", true, true).
		First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *subscriptionRepository) FindFreePlan() (*models.SubscriptionPlan, error) {
	var plan models.SubscriptionPlan
	err := database.DB.
		Where("is_free = ? AND is_active = ? AND is_public = ?", true, true, true).
		Order("display_order ASC").
		First(&plan).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &plan, nil
}

func (r *subscriptionRepository) ListAllPaginated(limit, offset int) ([]models.Subscription, int64, error) {
	q := database.DB.Model(&models.Subscription{})
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var subs []models.Subscription
	err := database.DB.Preload("Plan").Preload("PendingPlan").Order("created_at DESC").Limit(limit).Offset(offset).Find(&subs).Error
	return subs, total, err
}

func (r *subscriptionRepository) ListAllPlans() ([]models.SubscriptionPlan, error) {
	var plans []models.SubscriptionPlan
	err := database.DB.Order("display_order ASC").Order("name ASC").Find(&plans).Error
	return plans, err
}

func (r *subscriptionRepository) FindPlanByID(id string) (*models.SubscriptionPlan, error) {
	var plan models.SubscriptionPlan
	err := database.DB.Where("id = ?", id).First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *subscriptionRepository) CreatePlan(plan *models.SubscriptionPlan) error {
	return database.DB.Create(plan).Error
}

func (r *subscriptionRepository) UpdatePlan(plan *models.SubscriptionPlan) error {
	return database.DB.Save(plan).Error
}
