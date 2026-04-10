package ruqr

import (
	"regexp"
	"strings"
	"testing"
)

var crcSuffix = regexp.MustCompile(`\|CRC=[0-9A-F]{4}$`)

func TestBuildPayload_InvalidAccount(t *testing.T) {
	_, ok := BuildPayload(Input{
		Name:                 "ООО Тест",
		PersonalAcc:          "123",
		BankName:             "Банк",
		BIC:                  "044525225",
		CorrespondentAccount: "30101810100000000593",
		SumKopecks:           100,
		Purpose:              "Оплата",
		PayeeINN:             "7707083893",
		KPP:                  "770701001",
	})
	if ok {
		t.Fatal("expected invalid")
	}
}

func TestBuildPayload_Valid(t *testing.T) {
	s, ok := BuildPayload(Input{
		Name:                 "ООО Тест",
		PersonalAcc:          "40702810100000000001",
		BankName:             "Тестбанк",
		BIC:                  "044525225",
		CorrespondentAccount: "30101810100000000593",
		SumKopecks:           940500,
		Purpose:              "Оплата по счёту 1",
		PayeeINN:             "7707083893",
		KPP:                  "770701001",
	})
	if !ok || s == "" {
		t.Fatal("expected valid payload")
	}
	if !strings.HasPrefix(s, "ST00012|") {
		t.Fatalf("prefix: %q", s)
	}
	if !strings.Contains(s, "Sum=940500") {
		t.Fatalf("sum: %q", s)
	}
	if !strings.Contains(s, "PayeeINN=7707083893") {
		t.Fatalf("inn: %q", s)
	}
	if !strings.Contains(s, "KPP=770701001") {
		t.Fatalf("kpp: %q", s)
	}
	if !strings.Contains(s, "Name=ООО Тест") {
		t.Fatalf("name: %q", s)
	}
	if !strings.Contains(s, "Purpose=Оплата по счёту 1") {
		t.Fatalf("purpose: %q", s)
	}
	if !crcSuffix.MatchString(s) {
		t.Fatalf("crc suffix: %q", s)
	}
}
