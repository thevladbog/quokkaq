package assets

import _ "embed"

//go:embed fonts/DejaVuSans.ttf
var DejaVuSansTTF []byte

//go:embed fonts/DejaVuSans-Bold.ttf
var DejaVuSansBoldTTF []byte

//go:embed images/logo_text.png
var LogoTextPNG []byte

//go:embed images/quokka_watermark.png
var QuokkaWatermarkPNG []byte
