package services

import (
	"errors"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func kioskAccessRule(field, operator string) models.ServiceBehaviorCondition {
	return models.ServiceBehaviorCondition{
		Kind:     "rule",
		Field:    field,
		Operator: operator,
	}
}

func TestEvaluateKioskServiceAccess(t *testing.T) {
	tests := []struct {
		name    string
		policy  *models.ServiceBehaviorAccessPolicy
		want    bool
		wantErr error
	}{
		{name: "no policy allows", want: true},
		{
			name: "authenticated employee allows employee rule",
			policy: &models.ServiceBehaviorAccessPolicy{
				When: kioskAccessRule("identity.isEmployee", "is-true"),
			},
			want: true,
		},
		{
			name: "employee rule denies non employee rule",
			policy: &models.ServiceBehaviorAccessPolicy{
				When: kioskAccessRule("identity.isEmployee", "is-false"),
			},
			want: false,
		},
		{
			name: "groups fail closed until kiosk claims are available",
			policy: &models.ServiceBehaviorAccessPolicy{
				When: models.ServiceBehaviorCondition{
					Kind:     "rule",
					Field:    "identity.groups",
					Operator: "contains",
					Value:    "security",
				},
			},
			wantErr: ErrKioskServiceAccessContextUnavailable,
		},
		{
			name: "live conditions fail closed at ticket creation",
			policy: &models.ServiceBehaviorAccessPolicy{
				When: kioskAccessRule("live.isOpen", "is-true"),
			},
			wantErr: ErrKioskServiceAccessContextUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := EvaluateKioskServiceAccess(tt.policy)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("allowed = %v, want %v", got, tt.want)
			}
		})
	}
}
