package services

import (
	"fmt"
	"strings"
)

// rubPlural returns "рубль" / "рубля" / "рублей" for n (whole rubles count, for grammar).
func rubPlural(n int64) string {
	return pluralSlavic(n, "рубль", "рубля", "рублей")
}

func pluralSlavic(n int64, one, few, many string) string {
	mod100 := n % 100
	if mod100 >= 11 && mod100 <= 19 {
		return many
	}
	switch n % 10 {
	case 1:
		return one
	case 2, 3, 4:
		return few
	default:
		return many
	}
}

func thousandPlural(n int64) string {
	return pluralSlavic(n, "тысяча", "тысячи", "тысяч")
}

func millionPlural(n int64) string {
	return pluralSlavic(n, "миллион", "миллиона", "миллионов")
}

func billionPlural(n int64) string {
	return pluralSlavic(n, "миллиард", "миллиарда", "миллиардов")
}

const (
	genMasc = iota
	genFem
)

// hundreds 0-9 (сотни)
var hundreds = []string{
	"", "сто", "двести", "триста", "четыреста",
	"пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот",
}

// tens 2-9 (десятки)
var tens = []string{
	"", "", "двадцать", "тридцать", "сорок", "пятьдесят",
	"шестьдесят", "семьдесят", "восемьдесят", "девяносто",
}

// teens 10-19
var teens = []string{
	"десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
	"пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
}

// onesMasc 1-9 masculine
var onesMasc = []string{
	"", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
}

// onesFem 1-9 feminine (две тысячи)
var onesFem = []string{
	"", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
}

func under1000Words(n int, gender int) []string {
	if n < 0 || n >= 1000 {
		return nil
	}
	var p []string
	h := n / 100
	t := (n % 100) / 10
	o := n % 10
	if h > 0 {
		p = append(p, hundreds[h])
	}
	if t == 1 {
		p = append(p, teens[o])
		return p
	}
	if t > 1 {
		p = append(p, tens[t])
	}
	if o > 0 {
		if gender == genFem {
			p = append(p, onesFem[o])
		} else {
			p = append(p, onesMasc[o])
		}
	}
	return p
}

func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	if len(r) == 0 {
		return s
	}
	r[0] = []rune(strings.ToUpper(string(r[0])))[0]
	return string(r)
}

// RublesInWords returns amount in words with correct "рубль/рубля/рублей" (capitalized, no копейки).
func RublesInWords(rub int64) string {
	if rub < 0 {
		rub = -rub
	}
	if rub == 0 {
		return capitalizeFirst("ноль " + rubPlural(0))
	}
	var chunks []int
	n := rub
	for n > 0 {
		chunks = append(chunks, int(n%1000))
		n /= 1000
	}
	var parts []string
	for idx := len(chunks) - 1; idx >= 0; idx-- {
		v := chunks[idx]
		if v == 0 {
			continue
		}
		switch idx {
		case 0:
			w := under1000Words(v, genMasc)
			parts = append(parts, strings.Join(w, " "))
		case 1:
			w := under1000Words(v, genFem)
			parts = append(parts, strings.Join(w, " "))
			parts = append(parts, thousandPlural(int64(v)))
		case 2:
			w := under1000Words(v, genMasc)
			parts = append(parts, strings.Join(w, " "))
			parts = append(parts, millionPlural(int64(v)))
		case 3:
			w := under1000Words(v, genMasc)
			parts = append(parts, strings.Join(w, " "))
			parts = append(parts, billionPlural(int64(v)))
		default:
			return capitalizeFirst(fmt.Sprintf("%d рублей", rub))
		}
	}
	parts = append(parts, rubPlural(rub))
	return capitalizeFirst(strings.TrimSpace(strings.Join(parts, " ")))
}

// TotalPayableInWordsRU is the left block line: "Итого к оплате: … рублей NN коп."
func TotalPayableInWordsRU(amountMinor int64) string {
	if amountMinor < 0 {
		amountMinor = -amountMinor
	}
	rub := amountMinor / 100
	kop := amountMinor % 100
	core := RublesInWords(rub)
	return fmt.Sprintf("Итого к оплате: %s %02d коп.", core, kop)
}

// AmountInWordsRUOnly is the amount in words plus kopecks, without an "Итого" prefix.
func AmountInWordsRUOnly(amountMinor int64) string {
	if amountMinor < 0 {
		amountMinor = -amountMinor
	}
	rub := amountMinor / 100
	kop := amountMinor % 100
	return fmt.Sprintf("%s %02d коп.", RublesInWords(rub), kop)
}
