package ruqr

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Input mirrors apps/frontend/lib/ru-bank-qr-st00012.ts RuBankQrSt00012Input.
type Input struct {
	Name                   string
	PersonalAcc            string
	BankName               string
	BIC                    string
	CorrespondentAccount   string
	SumKopecks             int64
	Purpose                string
	PayeeINN               string
	KPP                    string
}

var (
	re20   = regexp.MustCompile(`^\d{20}$`)
	re9    = regexp.MustCompile(`^\d{9}$`)
	reInn10 = regexp.MustCompile(`^\d{10}$`)
	reInn12 = regexp.MustCompile(`^\d{12}$`)
	reKpp   = regexp.MustCompile(`^\d{9}$`)
)

func crc16CcittFalse(data []byte) uint16 {
	crc := uint16(0xffff)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = ((crc << 1) ^ 0x1021) & 0xffff
			} else {
				crc = (crc << 1) & 0xffff
			}
		}
	}
	return crc
}

func sanitizeField(s string) string {
	s = strings.ReplaceAll(s, "|", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// BuildPayload returns the UTF-8 QR payload string, or ok=false when TS buildRuBankQrSt00012Payload returns null.
func BuildPayload(in Input) (payload string, ok bool) {
	name := sanitizeField(in.Name)
	if len([]rune(name)) > 160 {
		name = string([]rune(name)[:160])
	}
	personalAcc := digitsOnly(in.PersonalAcc)
	bankName := sanitizeField(in.BankName)
	if len([]rune(bankName)) > 45 {
		bankName = string([]rune(bankName)[:45])
	}
	bic := digitsOnly(in.BIC)
	corr := digitsOnly(in.CorrespondentAccount)
	purpose := sanitizeField(in.Purpose)
	if len([]rune(purpose)) > 210 {
		purpose = string([]rune(purpose)[:210])
	}
	inn := digitsOnly(in.PayeeINN)

	if name == "" || !re20.MatchString(personalAcc) || bankName == "" || !re9.MatchString(bic) {
		return "", false
	}
	if !re20.MatchString(corr) {
		return "", false
	}
	if !reInn10.MatchString(inn) && !reInn12.MatchString(inn) {
		return "", false
	}
	sum := in.SumKopecks
	if sum <= 0 {
		return "", false
	}

	parts := []string{
		"ST00012",
		"Name=" + name,
		"PersonalAcc=" + personalAcc,
		"BankName=" + bankName,
		"BIC=" + bic,
		"CorrespAcc=" + corr,
		"Sum=" + strconv.FormatInt(sum, 10),
		"Purpose=" + purpose,
		"PayeeINN=" + inn,
	}
	kpp := digitsOnly(in.KPP)
	if reInn10.MatchString(inn) && reKpp.MatchString(kpp) {
		parts = append(parts, "KPP="+kpp)
	}

	withoutCrc := strings.Join(parts, "|")
	crcVal := crc16CcittFalse([]byte(withoutCrc))
	crcHex := strings.ToUpper(fmt.Sprintf("%04X", crcVal))
	full := withoutCrc + "|CRC=" + crcHex
	if !utf8.ValidString(full) {
		return "", false
	}
	return full, true
}
