package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"quokkaq-go-backend/internal/logger"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type CalendarIntegrationHandler struct {
	svc      *services.CalendarIntegrationService
	userRepo repository.UserRepository
}

func NewCalendarIntegrationHandler(svc *services.CalendarIntegrationService, userRepo repository.UserRepository) *CalendarIntegrationHandler {
	return &CalendarIntegrationHandler{svc: svc, userRepo: userRepo}
}

func (h *CalendarIntegrationHandler) resolveCompanyID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return "", false
		}
		logger.PrintfCtx(r.Context(), "calendar integration company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}

const (
	calendarIntMsgInternal           = "Internal server error"
	calendarIntMsgInvalidJSON        = "Invalid request body"
	calendarIntMsgBadRequest         = "Bad request"
	calendarIntMsgForbidden          = "Forbidden"
	calendarIntMsgNotFound           = "Not found"
	calendarIntMsgCannotDelete       = "Cannot delete integration"
	calendarIntMsgActivePreRegsBlock = "Active pre-registrations reference this calendar integration"
)

func logCalendarIntegration(op string, err error) {
	logger.Printf("calendar integration handler %s: %v", op, err)
}

func writeJSONDecodeError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op+": json decode", err)
	http.Error(w, calendarIntMsgInvalidJSON, http.StatusBadRequest)
}

// respondCalendarIntegrationError maps service/repository errors to safe HTTP responses and logs details.
func respondCalendarIntegrationError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op, err)
	switch {
	case errors.Is(err, services.ErrCalendarIntegrationLimit):
		http.Error(w, services.ErrCalendarIntegrationLimit.Error(), http.StatusConflict)
	case errors.Is(err, services.ErrCalendarIntegrationKindUnknown):
		http.Error(w, services.ErrCalendarIntegrationKindUnknown.Error(), http.StatusBadRequest)
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, calendarIntMsgNotFound, http.StatusNotFound)
	case errors.Is(err, services.ErrCalendarUnitCompanyMismatch):
		http.Error(w, calendarIntMsgForbidden, http.StatusForbidden)
	case errors.Is(err, services.ErrCalendarAppPasswordRequired):
		http.Error(w, calendarIntMsgBadRequest, http.StatusBadRequest)
	case errors.Is(err, services.ErrCalendarGoogleCalDAVIdentityImmutable):
		http.Error(w, services.ErrCalendarGoogleCalDAVIdentityImmutable.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrCalendarEnabledRequired):
		http.Error(w, services.ErrCalendarEnabledRequired.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrCalendarIntegrationBlockedByActivePreRegistrations):
		http.Error(w, calendarIntMsgActivePreRegsBlock, http.StatusBadRequest)
	case errors.Is(err, services.ErrGoogleCalendarOAuthNotConfigured):
		http.Error(w, services.ErrGoogleCalendarOAuthNotConfigured.Error(), http.StatusServiceUnavailable)
	case errors.Is(err, services.ErrGoogleCalendarOAuthNoRefreshToken):
		http.Error(w, services.ErrGoogleCalendarOAuthNoRefreshToken.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrGoogleCalendarPickInvalid):
		http.Error(w, services.ErrGoogleCalendarPickInvalid.Error(), http.StatusBadRequest)
	default:
		http.Error(w, calendarIntMsgInternal, http.StatusInternalServerError)
	}
}

func respondCalendarIntegrationDeleteError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op, err)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, calendarIntMsgNotFound, http.StatusNotFound)
	case errors.Is(err, services.ErrCalendarUnitCompanyMismatch):
		http.Error(w, calendarIntMsgForbidden, http.StatusForbidden)
	case errors.Is(err, services.ErrCalendarIntegrationBlockedByActivePreRegistrations):
		http.Error(w, calendarIntMsgCannotDelete, http.StatusBadRequest)
	default:
		http.Error(w, calendarIntMsgInternal, http.StatusInternalServerError)
	}
}

// Get godoc
// @ID           calendarIntegrationGet
// @Summary      Get calendar integration settings for a unit (legacy: first integration)
// @Tags         calendar-integration
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        unitId path string true "Unit ID"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /units/{unitId}/calendar-integration [get]
func (h *CalendarIntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.GetPublic(unitID, companyID)
	if err != nil {
		respondCalendarIntegrationError(w, "Get", err)
		return
	}
	RespondJSON(w, pub)
}

// Put godoc
// @ID           calendarIntegrationPut
// @Summary      Create or update calendar integration for a unit (legacy)
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        unitId path string true "Unit ID"
// @Param        body body services.UpsertIntegrationRequest true "Settings"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /units/{unitId}/calendar-integration [put]
func (h *CalendarIntegrationHandler) Put(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req services.UpsertIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "Put", err)
		return
	}
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.UpsertIntegration(unitID, companyID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "Put", err)
		return
	}
	RespondJSON(w, pub)
}

// ListMine godoc
// @ID           calendarIntegrationListMine
// @Summary      List calendar integrations for current company
// @Tags         calendar-integration
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Success      200 {array} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations [get]
func (h *CalendarIntegrationHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.ListPublicForCompany(companyID)
	if err != nil {
		respondCalendarIntegrationError(w, "ListMine", err)
		return
	}
	if list == nil {
		list = []services.CalendarIntegrationPublic{}
	}
	RespondJSON(w, list)
}

// CreateMine godoc
// @ID           calendarIntegrationCreateMine
// @Summary      Create a calendar integration for a unit in the company
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        body body services.CreateCalendarIntegrationRequest true "Payload"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations [post]
func (h *CalendarIntegrationHandler) CreateMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req services.CreateCalendarIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "CreateMine", err)
		return
	}
	pub, err := h.svc.CreateIntegration(companyID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "CreateMine", err)
		return
	}
	RespondJSON(w, pub)
}

// PutMine godoc
// @ID           calendarIntegrationPutMine
// @Summary      Update a calendar integration
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        integrationId path string true "Integration ID"
// @Param        body body services.UpdateCalendarIntegrationRequest true "Payload"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations/{integrationId} [put]
func (h *CalendarIntegrationHandler) PutMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	integrationID := chi.URLParam(r, "integrationId")
	var req services.UpdateCalendarIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "PutMine", err)
		return
	}
	pub, err := h.svc.UpdateIntegration(companyID, integrationID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "PutMine", err)
		return
	}
	RespondJSON(w, pub)
}

// DeleteMine godoc
// @ID           calendarIntegrationDeleteMine
// @Summary      Delete a calendar integration
// @Tags         calendar-integration
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        integrationId path string true "Integration ID"
// @Success      204
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations/{integrationId} [delete]
func (h *CalendarIntegrationHandler) DeleteMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	integrationID := chi.URLParam(r, "integrationId")
	if err := h.svc.DeleteIntegration(companyID, integrationID); err != nil {
		respondCalendarIntegrationDeleteError(w, "DeleteMine", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GoogleCalendarOAuthStartRequest is POST /companies/me/calendar-integrations/google/oauth/start body.
type GoogleCalendarOAuthStartRequest struct {
	UnitID     string `json:"unitId" binding:"required"`
	ReturnPath string `json:"returnPath" binding:"required"`
}

// GoogleCalendarOAuthStartResponse returns the browser redirect URL for Google consent.
type GoogleCalendarOAuthStartResponse struct {
	URL string `json:"url" binding:"required"`
}

func respondGoogleOAuthStartError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op, err)
	switch {
	case errors.Is(err, services.ErrGoogleCalendarOAuthNotConfigured):
		http.Error(w, services.ErrGoogleCalendarOAuthNotConfigured.Error(), http.StatusServiceUnavailable)
	case errors.Is(err, services.ErrGoogleCalendarOAuthUnitIDRequired):
		http.Error(w, services.ErrGoogleCalendarOAuthUnitIDRequired.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrGoogleCalendarOAuthInvalidReturnPath):
		http.Error(w, services.ErrGoogleCalendarOAuthInvalidReturnPath.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrGoogleCalendarOAuthRedisUnavailable):
		http.Error(w, services.ErrGoogleCalendarOAuthRedisUnavailable.Error(), http.StatusServiceUnavailable)
	case errors.Is(err, services.ErrGoogleCalendarOAuthSessionSaveFailed):
		http.Error(w, services.ErrGoogleCalendarOAuthSessionSaveFailed.Error(), http.StatusServiceUnavailable)
	case errors.Is(err, services.ErrCalendarIntegrationLimit):
		http.Error(w, services.ErrCalendarIntegrationLimit.Error(), http.StatusConflict)
	case errors.Is(err, services.ErrCalendarUnitCompanyMismatch):
		http.Error(w, calendarIntMsgForbidden, http.StatusForbidden)
	default:
		http.Error(w, calendarIntMsgInternal, http.StatusInternalServerError)
	}
}

func googleOAuthCallbackFailureReason(err error) string {
	switch {
	case errors.Is(err, services.ErrGoogleCalendarOAuthNotConfigured):
		return "not_configured"
	case errors.Is(err, services.ErrGoogleCalendarOAuthNoRefreshToken):
		return "no_refresh_token"
	case errors.Is(err, services.ErrGoogleCalendarOAuthUserinfo):
		return "userinfo"
	case errors.Is(err, services.ErrCalendarIntegrationLimit):
		return "limit"
	case errors.Is(err, services.ErrCalendarUnitCompanyMismatch):
		return "forbidden"
	case errors.Is(err, services.ErrCalendarAppPasswordRequired):
		return "create_failed"
	case errors.Is(err, services.ErrGoogleCalendarOAuthSessionSaveFailed):
		return "pick_save"
	default:
		return "oauth_failed"
	}
}

// GoogleOAuthStart godoc
// @ID           calendarIntegrationGoogleOAuthStart
// @Summary      Start Google Calendar OAuth (returns authorize URL)
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        body body GoogleCalendarOAuthStartRequest true "Payload"
// @Success      200 {object} GoogleCalendarOAuthStartResponse
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      409 {string} string "Conflict"
// @Failure      503 {string} string "Service Unavailable"
// @Router       /companies/me/calendar-integrations/google/oauth/start [post]
func (h *CalendarIntegrationHandler) GoogleOAuthStart(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req GoogleCalendarOAuthStartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "GoogleOAuthStart", err)
		return
	}
	authURL, err := h.svc.StartGoogleCalendarOAuth(r.Context(), companyID, req.UnitID, req.ReturnPath)
	if err != nil {
		respondGoogleOAuthStartError(w, "GoogleOAuthStart", err)
		return
	}
	RespondJSON(w, GoogleCalendarOAuthStartResponse{URL: authURL})
}

// GoogleOAuthCallback godoc
// @ID           calendarIntegrationGoogleOAuthCallback
// @Summary      Google Calendar OAuth callback (browser redirect)
// @Tags         calendar-integration
// @Param        code   query string true "Authorization code from Google"
// @Param        state  query string true "OAuth state (PKCE session key)"
// @Success      302 "Found — redirect only (no JSON body). Success: Location to return path with google_calendar_pick. Failures: Location to return path with google_calendar=error and reason (or equivalent query parameters)."
// @Header       302 {string} Location "Where the browser should navigate next (success or error redirect target)."
// @Router       /calendar-integrations/google/oauth/callback [get]
func (h *CalendarIntegrationHandler) GoogleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	okURL, failPath, err := h.svc.CompleteGoogleCalendarOAuth(r.Context(), r.URL.Query().Get("code"), r.URL.Query().Get("state"))
	if err != nil {
		loc := services.GoogleCalendarOAuthFailureRedirect(failPath, googleOAuthCallbackFailureReason(err))
		http.Redirect(w, r, loc, http.StatusFound)
		return
	}
	http.Redirect(w, r, okURL, http.StatusFound)
}

// GoogleCalendarPickListRequest is POST .../google/oauth/list-calendars body.
type GoogleCalendarPickListRequest struct {
	PickToken string `json:"pickToken" binding:"required"`
}

// GoogleCalendarPickListResponse is POST .../google/oauth/list-calendars response.
type GoogleCalendarPickListResponse struct {
	Calendars []services.GoogleCalendarPickOption `json:"calendars" binding:"required"`
}

// GoogleCalendarPickCompleteRequest is POST .../google/oauth/complete body.
type GoogleCalendarPickCompleteRequest struct {
	PickToken  string `json:"pickToken" binding:"required"`
	CalendarID string `json:"calendarId" binding:"required"`
}

// GooglePickListCalendars godoc
// @ID           calendarIntegrationGooglePickListCalendars
// @Summary      List writable Google calendars for a post-OAuth pick session
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        body body GoogleCalendarPickListRequest true "Payload"
// @Success      200 {object} GoogleCalendarPickListResponse
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      503 {string} string "Service Unavailable"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations/google/oauth/list-calendars [post]
func (h *CalendarIntegrationHandler) GooglePickListCalendars(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req GoogleCalendarPickListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "GooglePickListCalendars", err)
		return
	}
	cals, err := h.svc.ListGooglePickCalendars(r.Context(), companyID, req.PickToken)
	if err != nil {
		respondCalendarIntegrationError(w, "GooglePickListCalendars", err)
		return
	}
	if cals == nil {
		cals = []services.GoogleCalendarPickOption{}
	}
	RespondJSON(w, GoogleCalendarPickListResponse{Calendars: cals})
}

// GooglePickComplete godoc
// @ID           calendarIntegrationGooglePickComplete
// @Summary      Complete Google calendar pick and create google_caldav integration
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Optional company selector for admins with multiple companies"
// @Param        body body GoogleCalendarPickCompleteRequest true "Payload"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Failure      503 {string} string "Service Unavailable"
// @Failure      500 {string} string "Internal Server Error"
// @Router       /companies/me/calendar-integrations/google/oauth/complete [post]
func (h *CalendarIntegrationHandler) GooglePickComplete(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req GoogleCalendarPickCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "GooglePickComplete", err)
		return
	}
	out, err := h.svc.CompleteGoogleCalendarPick(r.Context(), companyID, req.PickToken, req.CalendarID)
	if err != nil {
		respondCalendarIntegrationError(w, "GooglePickComplete", err)
		return
	}
	RespondJSON(w, out)
}
