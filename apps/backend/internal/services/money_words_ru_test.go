package services

import (
	"strings"
	"testing"
)

func TestRublesInWords(t *testing.T) {
	cases := []struct {
		rub  int64
		want string // substring checks
	}{
		{0, "Ноль рублей"},
		{1, "Один рубль"},
		{2, "Два рубля"},
		{5, "Пять рублей"},
		{11, "Одиннадцать рублей"},
		{21, "Двадцать один рубль"},
		{22, "Двадцать два рубля"},
		{25, "Двадцать пять рублей"},
		{100, "Сто рублей"},
		{1000, "Одна тысяча рублей"},
		{1001, "Одна тысяча один рубль"},
		{9405, "Девять тысяч четыреста пять рублей"},
	}
	for _, tc := range cases {
		got := RublesInWords(tc.rub)
		if got != tc.want {
			t.Errorf("RublesInWords(%d) = %q want %q", tc.rub, got, tc.want)
		}
	}
}

func TestTotalPayableInWordsRU(t *testing.T) {
	s := TotalPayableInWordsRU(940_500)
	if !strings.HasPrefix(s, "Итого к оплате: ") {
		t.Fatalf("prefix: %q", s)
	}
	if !strings.Contains(s, "00 коп.") {
		t.Fatalf("kopecks: %q", s)
	}
}

func TestAmountInWordsRUOnly(t *testing.T) {
	s := AmountInWordsRUOnly(940_500)
	if strings.Contains(s, "Итого") {
		t.Fatalf("unexpected prefix: %q", s)
	}
	if !strings.HasSuffix(s, "00 коп.") {
		t.Fatalf("kopecks: %q", s)
	}
}
