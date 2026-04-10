package services

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"math"
	"sync"

	"quokkaq-go-backend/internal/assets"

	"github.com/signintech/gopdf"
)

// Same idea as CSS on the site: full-color mascot, uniform transparency over white (e.g. opacity-20).
// quokka_watermark.png stores alpha as 0–2/255; PDF transparency alone would hide it, so we
// composite onto white in software: out = rgb * eff + 255 * (1-eff), eff = min(1, α/255*k) * opacity.
const (
	watermarkCSSOpacity = 0.20 // ~Tailwind opacity-20 on the image layer
	// Boost so micro-alpha in the asset behaves like a normal PNG under opacity (no flat gray slab:
	// pixels with α=0 stay paper-white).
	watermarkAlphaBoost = 58.0
)

var (
	quokkaOnce     sync.Once
	quokkaFadedPNG []byte
	quokkaHolder   gopdf.ImageHolder
	quokkaInitErr  error
)

func initQuokkaWatermarkCache() {
	if len(assets.QuokkaWatermarkPNG) == 0 {
		return
	}
	quokkaFadedPNG, quokkaInitErr = watermarkOpacityOnWhite(assets.QuokkaWatermarkPNG)
	if quokkaInitErr != nil {
		return
	}
	quokkaHolder, quokkaInitErr = gopdf.ImageHolderByBytes(quokkaFadedPNG)
}

func watermarkOpacityOnWhite(src []byte) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	b := img.Bounds()
	out := image.NewNRGBA(b)

	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r16, g16, b16, a16 := img.At(x, y).RGBA()
			a8 := uint8(a16 >> 8)
			if a8 == 0 {
				out.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
				continue
			}
			r8 := float64(r16 >> 8)
			g8 := float64(g16 >> 8)
			b8 := float64(b16 >> 8)

			cov := math.Min(1.0, float64(a8)/255.0*watermarkAlphaBoost)
			eff := cov * watermarkCSSOpacity
			if eff > 0.38 {
				eff = 0.38
			}

			nr := uint8(r8*eff + 255*(1-eff) + 0.5)
			ng := uint8(g8*eff + 255*(1-eff) + 0.5)
			nb := uint8(b8*eff + 255*(1-eff) + 0.5)
			out.SetNRGBA(x, y, color.NRGBA{R: nr, G: ng, B: nb, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// drawQuokkaWatermark draws the mascot in the bottom-right (~37% of page width), behind content.
func drawQuokkaWatermark(pdf *gopdf.GoPdf) error {
	if len(assets.QuokkaWatermarkPNG) == 0 {
		return nil
	}
	quokkaOnce.Do(initQuokkaWatermarkCache)
	if quokkaInitErr != nil {
		return quokkaInitErr
	}
	if quokkaHolder == nil {
		return nil
	}
	wmW := pdfPageW * 0.37
	wmH := wmW
	x := pdfPageW - wmW - pdfMargin*0.35
	y := pdfPageH - pdfMargin*0.35 - wmH
	return pdf.ImageByHolder(quokkaHolder, x, y, &gopdf.Rect{W: wmW, H: wmH})
}
