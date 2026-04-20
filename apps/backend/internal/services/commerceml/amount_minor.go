package commerceml

import "fmt"

// FormatAmountFromMinorUnits renders a decimal amount for CommerceML XML from integer minor units (e.g. kopeks).
// Uses integer division only — no float rounding artifacts.
func FormatAmountFromMinorUnits(amount int64) string {
	neg := amount < 0
	n := amount
	if neg {
		n = -n
	}
	whole := n / 100
	frac := n % 100
	out := fmt.Sprintf("%d.%02d", whole, frac)
	if neg {
		return "-" + out
	}
	return out
}
