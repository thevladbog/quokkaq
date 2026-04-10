package invoicing

import (
	"errors"
	"math"
)

// LineInput is raw invoice line data before persisted totals.
type LineInput struct {
	UnitPriceInclVatMinor int64
	Quantity              float64
	DiscountPercent       *float64
	DiscountAmountMinor   *int64
	VatExempt             bool
	VatRatePercent        float64
}

// LineTotals are computed net / VAT / gross in minor units (gross after discount).
type LineTotals struct {
	LineNetMinor   int64
	VatAmountMinor int64
	LineGrossMinor int64
}

// ComputeLine derives net and VAT from unit price gross, quantity, discount, and VAT mode.
func ComputeLine(in LineInput) (LineTotals, error) {
	if in.Quantity <= 0 || math.IsNaN(in.Quantity) || math.IsInf(in.Quantity, 0) {
		return LineTotals{}, errors.New("quantity must be positive")
	}
	if in.UnitPriceInclVatMinor < 0 {
		return LineTotals{}, errors.New("unit price cannot be negative")
	}
	if in.DiscountPercent != nil && in.DiscountAmountMinor != nil {
		return LineTotals{}, errors.New("only one discount type allowed")
	}
	if in.VatRatePercent < 0 {
		return LineTotals{}, errors.New("vat rate cannot be negative")
	}

	lineGross := int64(math.Round(float64(in.UnitPriceInclVatMinor) * in.Quantity))
	if lineGross < 0 {
		return LineTotals{}, errors.New("line amount overflow")
	}

	discounted := lineGross
	if in.DiscountPercent != nil {
		p := *in.DiscountPercent
		if p < 0 || p > 100 {
			return LineTotals{}, errors.New("discount percent must be 0..100")
		}
		discounted = int64(math.Round(float64(lineGross) * (1.0 - p/100.0)))
	}
	if in.DiscountAmountMinor != nil {
		if *in.DiscountAmountMinor < 0 {
			return LineTotals{}, errors.New("discount amount cannot be negative")
		}
		discounted = lineGross - *in.DiscountAmountMinor
	}
	if discounted < 0 {
		discounted = 0
	}

	if in.VatExempt {
		return LineTotals{LineNetMinor: discounted, VatAmountMinor: 0, LineGrossMinor: discounted}, nil
	}
	if in.VatRatePercent == 0 {
		return LineTotals{LineNetMinor: discounted, VatAmountMinor: 0, LineGrossMinor: discounted}, nil
	}

	net := int64(math.Round(float64(discounted) / (1.0 + in.VatRatePercent/100.0)))
	vat := discounted - net
	if vat < 0 {
		vat = 0
	}
	return LineTotals{LineNetMinor: net, VatAmountMinor: vat, LineGrossMinor: discounted}, nil
}
