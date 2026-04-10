package services

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"strings"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
)

// invoiceBarcodeContent returns ASCII payload for CODE-128 (document number or invoice id fallback).
func invoiceBarcodeContent(docNo, invoiceID string) string {
	s := strings.TrimSpace(docNo)
	if s == "" || s == "—" {
		id := strings.TrimSpace(strings.ReplaceAll(invoiceID, "-", ""))
		if len(id) > 16 {
			id = id[:16]
		}
		if id != "" {
			return "INV" + id
		}
		return "INVOICE"
	}
	var b strings.Builder
	for _, r := range s {
		if r >= 32 && r <= 126 {
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return invoiceBarcodeContent("—", invoiceID)
	}
	return out
}

func encodeCode128PNG(data string, widthPx, heightPx int) ([]byte, error) {
	if widthPx < 20 || heightPx < 8 {
		return nil, fmt.Errorf("barcode image too small")
	}
	bc, err := code128.Encode(data)
	if err != nil {
		return nil, err
	}
	scaled, err := barcode.Scale(bc, widthPx, heightPx)
	if err != nil {
		return nil, err
	}
	bounds := scaled.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, scaled, bounds.Min, draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
