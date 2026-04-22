package plans

import (
	"encoding/json"
)

// PlanDefinition represents a subscription plan configuration
type PlanDefinition struct {
	Name     string
	Code     string
	Price    int64
	Currency string
	Interval string
	Limits   map[string]int
	Features map[string]bool
}

// Plans contains all available subscription plans.
// Price is in minor units (kopeks) and represents the per-subdivision monthly rate
// when PricingModel == "per_unit". Total billing = price × active_subdivisions.
var Plans = map[string]PlanDefinition{
	"starter": {
		Name:     "Starter",
		Code:     "starter",
		Price:    300000, // 3 000 руб/мес за подразделение (per-unit)
		Currency: "RUB",
		Interval: "month",
		Limits: map[string]int{
			"units":                    3, // max 3 subdivisions on this plan
			"users":                    5,
			"tickets_per_month":        1000,
			"services":                 10,
			"counters":                 5,
			"zones_per_unit":           2, // max service zones per subdivision
			"integration_api_keys_max": 2,
			"webhook_endpoints_max":    2,
		},
		Features: map[string]bool{
			"websocket_updates":     true,
			"basic_reports":         true,
			"email_support":         true,
			"api_access":            false,
			"outbound_webhooks":     false,
			"public_queue_widget":   false,
			"white_label":           false,
			"custom_branding":       false,
			"priority_support":      false,
			"counter_guest_survey":  false,
			"counter_board":         true,
			"virtual_queue":         false,
			"visitor_notifications": false,
		},
	},
	"professional": {
		Name:     "Professional",
		Code:     "professional",
		Price:    250000, // 2 500 руб/мес за подразделение (per-unit; volume discount)
		Currency: "RUB",
		Interval: "month",
		Limits: map[string]int{
			"units":                    10, // max 10 subdivisions on this plan
			"users":                    20,
			"tickets_per_month":        10000,
			"services":                 50,
			"counters":                 25,
			"zones_per_unit":           5, // max service zones per subdivision
			"integration_api_keys_max": 20,
			"webhook_endpoints_max":    20,
		},
		Features: map[string]bool{
			"websocket_updates":     true,
			"basic_reports":         true,
			"advanced_reports":      true,
			"email_support":         true,
			"phone_support":         true,
			"api_access":            true,
			"outbound_webhooks":     true,
			"public_queue_widget":   true,
			"white_label":           false,
			"custom_branding":       true,
			"priority_support":      true,
			"counter_guest_survey":  true,
			"counter_board":         true,
			"virtual_queue":         true,
			"visitor_notifications": true,
		},
	},
	"enterprise": {
		Name:     "Enterprise",
		Code:     "enterprise",
		Price:    0, // Custom pricing (not isFree — sales-led)
		Currency: "RUB",
		Interval: "month",
		Limits: map[string]int{
			"units":                    -1, // unlimited
			"users":                    -1,
			"tickets_per_month":        -1,
			"services":                 -1,
			"counters":                 -1,
			"zones_per_unit":           -1, // unlimited zones
			"integration_api_keys_max": -1,
			"webhook_endpoints_max":    -1,
		},
		Features: map[string]bool{
			"websocket_updates":     true,
			"basic_reports":         true,
			"advanced_reports":      true,
			"email_support":         true,
			"phone_support":         true,
			"api_access":            true,
			"outbound_webhooks":     true,
			"public_queue_widget":   true,
			"white_label":           true,
			"custom_branding":       true,
			"priority_support":      true,
			"dedicated_support":     true,
			"sla_guarantee":         true,
			"custom_integrations":   true,
			"counter_guest_survey":  true,
			"counter_board":         true,
			"virtual_queue":         true,
			"visitor_notifications": true,
		},
	},
	"grandfathered": {
		Name:     "Grandfathered",
		Code:     "grandfathered",
		Price:    0, // Free for existing legacy customers
		Currency: "RUB",
		Interval: "month",
		Limits: map[string]int{
			"units":                    -1, // unlimited
			"users":                    -1,
			"tickets_per_month":        -1,
			"services":                 -1,
			"counters":                 -1,
			"zones_per_unit":           -1, // unlimited zones
			"integration_api_keys_max": -1,
			"webhook_endpoints_max":    -1,
		},
		Features: map[string]bool{
			"websocket_updates":     true,
			"basic_reports":         true,
			"advanced_reports":      true,
			"email_support":         true,
			"api_access":            true,
			"outbound_webhooks":     true,
			"public_queue_widget":   true,
			"white_label":           false,
			"counter_guest_survey":  true,
			"counter_board":         true,
			"virtual_queue":         true,
			"visitor_notifications": false,
		},
	},
}

// GetPlan returns a plan definition by code
func GetPlan(code string) (PlanDefinition, bool) {
	plan, exists := Plans[code]
	return plan, exists
}

// GetAllPublicPlans returns all plans that should be shown on pricing page
func GetAllPublicPlans() []PlanDefinition {
	publicPlans := []PlanDefinition{}
	for code, plan := range Plans {
		// Don't show grandfathered plan publicly
		if code != "grandfathered" {
			publicPlans = append(publicPlans, plan)
		}
	}
	return publicPlans
}

// Helper functions to convert to JSON
func (p *PlanDefinition) LimitsJSON() (json.RawMessage, error) {
	return json.Marshal(p.Limits)
}

func (p *PlanDefinition) FeaturesJSON() (json.RawMessage, error) {
	return json.Marshal(p.Features)
}
