package services

import "testing"

func TestSubscriptionPlanFeatureTruthy(t *testing.T) {
	t.Parallel()
	cases := []struct {
		v    interface{}
		want bool
	}{
		{nil, false},
		{false, false},
		{true, true},
		{float64(0), false},
		{float64(1), true},
		{float64(-1), false},
		{"", false},
		{"false", false},
		{"TRUE", true},
		{"  yes ", true},
		{"1", true},
		{struct{}{}, false},
	}
	for _, tc := range cases {
		if got := subscriptionPlanFeatureTruthy(tc.v); got != tc.want {
			t.Fatalf("%#v: got %v want %v", tc.v, got, tc.want)
		}
	}
}
