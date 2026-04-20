package commerceml

import "testing"

func TestFormatAmountFromMinorUnits(t *testing.T) {
	tests := []struct {
		in   int64
		want string
	}{
		{0, "0.00"},
		{1, "0.01"},
		{99, "0.99"},
		{100, "1.00"},
		{12345, "123.45"},
		{-1, "-0.01"},
		{-100, "-1.00"},
		{99999999999, "999999999.99"},
	}
	for _, tt := range tests {
		if got := FormatAmountFromMinorUnits(tt.in); got != tt.want {
			t.Errorf("FormatAmountFromMinorUnits(%d) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
