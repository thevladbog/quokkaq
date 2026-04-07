package middleware

import (
	"log"
	"net/http"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// RespondRepoFindError writes 404 for missing rows (GORM not found) or 500 + log for other failures. Returns true if the handler should stop.
func RespondRepoFindError(w http.ResponseWriter, err error, op string) bool {
	if err == nil {
		return false
	}
	if repository.IsNotFound(err) {
		http.Error(w, "Not found", http.StatusNotFound)
		return true
	}
	log.Printf("%s: %v", op, err)
	http.Error(w, "Internal server error", http.StatusInternalServerError)
	return true
}

// RequireAdmin allows only users with the "admin" role.
func RequireAdmin(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			allowed, err := userRepo.IsAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireUnitMember allows admins or users assigned to the unit (URL param unitId or id on /units routes).
func RequireUnitMember(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			unitID := chi.URLParam(r, "unitId")
			if unitID == "" {
				unitID = chi.URLParam(r, "id")
			}
			if unitID == "" {
				next.ServeHTTP(w, r)
				return
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, unitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireServiceUnit resolves service id from the URL and checks unit membership.
func RequireServiceUnit(userRepo repository.UserRepository, serviceRepo repository.ServiceRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			serviceID := chi.URLParam(r, "id")
			if serviceID == "" {
				next.ServeHTTP(w, r)
				return
			}
			svc, err := serviceRepo.FindByID(serviceID)
			if RespondRepoFindError(w, err, "RequireServiceUnit serviceRepo.FindByID") {
				return
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, svc.UnitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireTicketUnit resolves ticket id from the URL and checks unit membership.
func RequireTicketUnit(userRepo repository.UserRepository, ticketRepo repository.TicketRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			ticketID := chi.URLParam(r, "id")
			if ticketID == "" {
				next.ServeHTTP(w, r)
				return
			}
			ticket, err := ticketRepo.FindByID(ticketID)
			if RespondRepoFindError(w, err, "RequireTicketUnit ticketRepo.FindByID") {
				return
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, ticket.UnitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireBookingUnit resolves booking id from the URL and checks unit membership.
func RequireBookingUnit(userRepo repository.UserRepository, bookingRepo repository.BookingRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			bookingID := chi.URLParam(r, "id")
			if bookingID == "" {
				next.ServeHTTP(w, r)
				return
			}
			b, err := bookingRepo.FindByID(bookingID)
			if RespondRepoFindError(w, err, "RequireBookingUnit bookingRepo.FindByID") {
				return
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, b.UnitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireCounterUnit resolves counter id from the URL and checks unit membership.
func RequireCounterUnit(userRepo repository.UserRepository, counterRepo repository.CounterRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			counterID := chi.URLParam(r, "id")
			if counterID == "" {
				next.ServeHTTP(w, r)
				return
			}
			c, err := counterRepo.FindByID(counterID)
			if RespondRepoFindError(w, err, "RequireCounterUnit counterRepo.FindByID") {
				return
			}
			allowed, err := userRepo.IsAdminOrHasUnitAccess(userID, c.UnitID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
