package services

import (
	"encoding/json"
	"errors"

	"quokkaq-go-backend/internal/models"
)

// ErrKioskServiceAccessContextUnavailable is returned when a service access
// rule requires facts that are not part of the trusted ticket-create request.
// Kiosk access must fail closed rather than guessing from client-provided data.
var ErrKioskServiceAccessContextUnavailable = errors.New("kiosk service access context unavailable")

// EvaluateKioskServiceBehaviorAccess reads the access policy from the raw
// behavior JSON. ServiceBehavior intentionally preserves raw JSON and does not
// populate its exported fields during database unmarshalling.
func EvaluateKioskServiceBehaviorAccess(behavior *models.ServiceBehavior, employee bool) (bool, error) {
	return EvaluateKioskServiceBehaviorAccessWithGroups(behavior, employee, nil)
}

func EvaluateKioskServiceBehaviorAccessWithGroups(behavior *models.ServiceBehavior, employee bool, groups []string) (bool, error) {
	if behavior == nil {
		return true, nil
	}
	var envelope struct {
		Access *models.ServiceBehaviorAccessPolicy `json:"access"`
	}
	if err := json.Unmarshal(behavior.RawJSON(), &envelope); err != nil {
		return false, ErrKioskServiceAccessContextUnavailable
	}
	return evaluateKioskServiceAccessForIdentity(envelope.Access, employee, groups)
}

// EvaluateKioskServiceAccess evaluates the identity facts that are established
// by a validated kioskIdentifiedUserId. Live/session facts and group claims are
// intentionally unavailable until they have an explicit trusted API contract.
func EvaluateKioskServiceAccess(policy *models.ServiceBehaviorAccessPolicy) (bool, error) {
	return EvaluateKioskServiceAccessForIdentity(policy, true)
}

// EvaluateKioskServiceAccessForIdentity evaluates a kiosk request with the
// supplied identity state. A resolved employee is authenticated and employee;
// an anonymous kiosk request has neither fact.
func EvaluateKioskServiceAccessForIdentity(policy *models.ServiceBehaviorAccessPolicy, employee bool) (bool, error) {
	return evaluateKioskServiceAccessForIdentity(policy, employee, nil)
}

func evaluateKioskServiceAccessForIdentity(policy *models.ServiceBehaviorAccessPolicy, employee bool, groups []string) (bool, error) {
	if policy == nil {
		return true, nil
	}
	return evaluateKioskServiceCondition(policy.When, employee, groups)
}

func evaluateKioskServiceCondition(condition models.ServiceBehaviorCondition, employee bool, groups []string) (bool, error) {
	switch condition.Kind {
	case "rule":
		switch condition.Field {
		case "identity.isAuthenticated", "identity.isEmployee":
			switch condition.Operator {
			case "is-true":
				return employee, nil
			case "is-false":
				return !employee, nil
			default:
				return false, ErrKioskServiceAccessContextUnavailable
			}
		case "identity.groups":
			if groups == nil {
				return false, ErrKioskServiceAccessContextUnavailable
			}
			if condition.Operator != "contains" && condition.Operator != "not-contains" {
				return false, ErrKioskServiceAccessContextUnavailable
			}
			expected, ok := condition.Value.(string)
			if !ok {
				return false, ErrKioskServiceAccessContextUnavailable
			}
			found := false
			for _, group := range groups {
				if group == expected {
					found = true
					break
				}
			}
			if condition.Operator == "not-contains" {
				return !found, nil
			}
			return found, nil
		case "live.queueLength", "live.isOpen", "live.isConnected", "session.selectedServiceId":
			return false, ErrKioskServiceAccessContextUnavailable
		default:
			return false, ErrKioskServiceAccessContextUnavailable
		}
	case "group":
		if len(condition.Children) == 0 {
			return false, ErrKioskServiceAccessContextUnavailable
		}
		if condition.Combinator == "and" {
			for _, child := range condition.Children {
				allowed, err := evaluateKioskServiceCondition(child, employee, groups)
				if err != nil {
					return false, err
				}
				if !allowed {
					return false, nil
				}
			}
			return true, nil
		}
		if condition.Combinator == "or" {
			for _, child := range condition.Children {
				allowed, err := evaluateKioskServiceCondition(child, employee, groups)
				if err != nil {
					return false, err
				}
				if allowed {
					return true, nil
				}
			}
			return false, nil
		}
		return false, ErrKioskServiceAccessContextUnavailable
	default:
		return false, ErrKioskServiceAccessContextUnavailable
	}
}
