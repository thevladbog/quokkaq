package summary

import "testing"

func TestParse_Free(t *testing.T) {
	p := Parse("[QQ] Возврат товаров")
	if p.State != StateFree || p.ServiceLabel != "Возврат товаров" {
		t.Fatalf("got %+v", p)
	}
}

func TestParse_Booked(t *testing.T) {
	p := Parse("[Забронирован][QQ] Возврат товаров")
	if p.State != StateBooked || p.ServiceLabel != "Возврат товаров" {
		t.Fatalf("got %+v", p)
	}
}

func TestParse_Ticket(t *testing.T) {
	p := Parse("[A-005][Ожидает][QQ] Возврат товаров")
	if p.State != StateTicketWaiting || p.ServiceLabel != "Возврат товаров" || p.TicketToken != "A-005" {
		t.Fatalf("got %+v", p)
	}
}

func TestFormatRoundTrip(t *testing.T) {
	l := "Test service"
	s := FormatFree(l)
	p := Parse(s)
	if p.State != StateFree || p.ServiceLabel != l {
		t.Fatalf("got %+v", p)
	}
}
