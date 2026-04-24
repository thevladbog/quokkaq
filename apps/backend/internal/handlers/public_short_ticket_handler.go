package handlers

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// PublicShortTicketHandler issues HTTP 302 to the long ticket page URL.
type PublicShortTicketHandler struct {
	links repository.TicketShortLinkRepository
}

func NewPublicShortTicketHandler(links repository.TicketShortLinkRepository) *PublicShortTicketHandler {
	return &PublicShortTicketHandler{links: links}
}

// RedirectToTicket is GET /l/{code} (public, rate-limited at route registration).
func (h *PublicShortTicketHandler) RedirectToTicket(w http.ResponseWriter, r *http.Request) {
	if h.links == nil {
		http.Error(w, "not configured", http.StatusServiceUnavailable)
		return
	}
	code := strings.TrimSpace(chi.URLParam(r, "code"))
	if code == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	row, err := h.links.GetByCode(code)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	loc := fmt.Sprintf("%s/%s/ticket/%s", base, row.Locale, row.TicketID)
	if q := r.URL.Query().Get("src"); q != "" {
		loc += "?src=" + q
	}
	w.Header().Set("Location", loc)
	w.WriteHeader(http.StatusFound)
}
