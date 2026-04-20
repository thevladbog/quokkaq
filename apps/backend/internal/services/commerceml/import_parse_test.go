package commerceml

import "testing"

func TestStatusLooksPaid(t *testing.T) {
	tests := []struct {
		s    string
		want bool
	}{
		{"", false},
		{"Оплачен", true},
		{"оплачен полностью", true},
		{"paid", true},
		{"не оплачен", false},
		{"не оплачен частично", false},
		{"частично оплачен", false},
		{"unpaid", false},
		{"not paid", false},
		{"partially paid", false},
	}
	for _, tt := range tests {
		if got := StatusLooksPaid(tt.s); got != tt.want {
			t.Errorf("StatusLooksPaid(%q) = %v, want %v", tt.s, got, tt.want)
		}
	}
}
