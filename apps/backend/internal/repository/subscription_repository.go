package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

type SubscriptionRepository interface {
	Create(subscription *models.Subscription) error
	FindByID(id string) (*models.Subscription, error)
	FindByCompanyID(companyID string) (*models.Subscription, error)
	Update(subscription *models.Subscription) error
	Delete(id string) error
	ListAllPaginated(limit, offset int) ([]models.Subscription, int64, error)
	GetActivePlans() ([]models.SubscriptionPlan, error)
	ListAllPlans() ([]models.SubscriptionPlan, error)
	FindPlanByID(id string) (*models.SubscriptionPlan, error)
	FindPlanByCode(code string) (*models.SubscriptionPlan, error)
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
	err := database.DB.Where("is_active = ?", true).Find(&plans).Error
	return plans, err
}

func (r *subscriptionRepository) FindPlanByCode(code string) (*models.SubscriptionPlan, error) {
	var plan models.SubscriptionPlan
	err := database.DB.Where("code = ?", code).Where("is_active = ?", true).First(&plan).Error
	if err != nil {
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
	err := database.DB.Order("name ASC").Find(&plans).Error
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
