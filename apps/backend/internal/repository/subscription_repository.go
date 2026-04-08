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
	GetActivePlans() ([]models.SubscriptionPlan, error)
	FindPlanByCode(code string) (*models.SubscriptionPlan, error)
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
	err := database.DB.Preload("Plan").Where("id = ?", id).First(&subscription).Error
	if err != nil {
		return nil, err
	}
	return &subscription, nil
}

func (r *subscriptionRepository) FindByCompanyID(companyID string) (*models.Subscription, error) {
	var subscription models.Subscription
	err := database.DB.Preload("Plan").Where("company_id = ?", companyID).First(&subscription).Error
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
