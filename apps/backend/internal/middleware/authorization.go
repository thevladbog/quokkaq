package middleware

import (
	"log"
	"net/http"
	"os"
	"quokkaq-go-backend/internal/repository"
	"strings"

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

// platformAllowTenantAdmin is true when tenant "admin" may call /platform APIs (never when APP_ENV=production).
//   - PLATFORM_ALLOW_TENANT_ADMIN=true|1|yes: allow (non-production only).
//   - PLATFORM_ALLOW_TENANT_ADMIN=false|0|no: never allow.
//   - unset: allow only for typical local dev (APP_ENV empty, development, dev, local) so `go run` without .env works.
//     Staging should set APP_ENV=staging and either assign platform_admin or set PLATFORM_ALLOW_TENANT_ADMIN=true.
func platformAllowTenantAdmin() bool {
	app := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if app == "production" {
		return false
	}
	v := strings.ToLower(strings.TrimSpace(os.Getenv("PLATFORM_ALLOW_TENANT_ADMIN")))
	if v == "false" || v == "0" || v == "no" {
		return false
	}
	if v == "true" || v == "1" || v == "yes" {
		return true
	}
	return app == "" || app == "development" || app == "dev" || app == "local"
}

// RequirePlatformAdmin allows users with the "platform_admin" role (SaaS operator).
// When PLATFORM_ALLOW_TENANT_ADMIN is enabled and APP_ENV is not production, tenant "admin" is also allowed (local dev).
func RequirePlatformAdmin(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			allowed, err := userRepo.IsPlatformAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !allowed && platformAllowTenantAdmin() {
				allowed, err = userRepo.IsAdmin(userID)
				if err != nil {
					http.Error(w, "Internal server error", http.StatusInternalServerError)
					return
				}
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAdminTerminalOrUnitMemberForUnit allows:
//   - desktop terminal JWT when claim unit_id matches the URL unit id (kiosk shell);
//   - tenant admin; or
//   - any user with access to that unit (same as RequireUnitMember).
//
// Use for narrow config updates (e.g. kiosk settings) where full PATCH /units/{id} is admin-only.
func RequireAdminTerminalOrUnitMemberForUnit(userRepo repository.UserRepository, urlUnitIDParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			unitID := chi.URLParam(r, urlUnitIDParam)
			if strings.TrimSpace(unitID) == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			tokenType, _ := r.Context().Value(TokenTypeKey).(string)
			if tokenType == "terminal" {
				tu, ok := r.Context().Value(TerminalUnitIDKey).(string)
				if !ok || tu != unitID {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
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

// RequireUnitBranchMember allows tenant admin or any user assigned to the subdivision or a descendant unit (service zones).
func RequireUnitBranchMember(userRepo repository.UserRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
			if unitID == "" {
				unitID = strings.TrimSpace(chi.URLParam(r, "id"))
			}
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			allowed, err := userRepo.HasUnitBranchAccess(userID, unitID)
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
			unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
			if unitID == "" {
				unitID = strings.TrimSpace(chi.URLParam(r, "id"))
			}
			if unitID == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
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

// RequireGuestSurveyCompletionImageRead allows reading guest-survey completion markdown images:
//   - terminal JWT with unit_id and counter_id matching the URL unit (counter tablet);
//   - staff user with unit access (same as RequireUnitMember) or platform_admin.
//
// Use after JWTAuth on GET /units/{unitId}/guest-survey/completion-images/{fileName}.
func RequireGuestSurveyCompletionImageRead(userRepo repository.UserRepository, urlUnitIDParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			unitID := chi.URLParam(r, urlUnitIDParam)
			if strings.TrimSpace(unitID) == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			tokenType, _ := r.Context().Value(TokenTypeKey).(string)
			if tokenType == "terminal" {
				got, ok := r.Context().Value(TerminalUnitIDKey).(string)
				if !ok || got != unitID {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				cid, ok := r.Context().Value(TerminalCounterIDKey).(string)
				if !ok || strings.TrimSpace(cid) == "" {
					http.Error(w, "Forbidden", http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			platform, err := userRepo.IsPlatformAdmin(userID)
			if err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if platform {
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

// RequireTerminalGuestSurvey allows only a terminal JWT bound to a counter, with unit_id matching the URL unit.
// Use after JWTAuth on /units/{unitId}/guest-survey/* routes.
func RequireTerminalGuestSurvey(urlUnitIDParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if typ, _ := r.Context().Value(TokenTypeKey).(string); typ != "terminal" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			want := chi.URLParam(r, urlUnitIDParam)
			if strings.TrimSpace(want) == "" {
				http.Error(w, "Unit ID required", http.StatusBadRequest)
				return
			}
			got, ok := r.Context().Value(TerminalUnitIDKey).(string)
			if !ok || got != want {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			cid, ok := r.Context().Value(TerminalCounterIDKey).(string)
			if !ok || strings.TrimSpace(cid) == "" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
