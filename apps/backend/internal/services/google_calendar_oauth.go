package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"quokkaq-go-backend/internal/sso/redisstore"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// Google calendar OAuth (admin): env GOOGLE_CALENDAR_OAUTH_CLIENT_ID, GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET,
// GOOGLE_CALENDAR_OAUTH_REDIRECT_URL must match the Google Cloud OAuth client.

var (
	// ErrGoogleCalendarOAuthUnitIDRequired is returned when the start request omits unitId.
	ErrGoogleCalendarOAuthUnitIDRequired = errors.New("unitId is required")
	// ErrGoogleCalendarOAuthNotConfigured is returned when Google OAuth env is incomplete.
	ErrGoogleCalendarOAuthNotConfigured = errors.New("google calendar oauth is not configured on this server")
	// ErrGoogleCalendarOAuthNoRefreshToken is returned when Google did not return a refresh token (re-consent may be required).
	ErrGoogleCalendarOAuthNoRefreshToken = errors.New("google did not return a refresh token; try again and ensure account consent is granted")
	// ErrGoogleCalendarOAuthUserinfo is returned when the email could not be read from Google userinfo.
	ErrGoogleCalendarOAuthUserinfo = errors.New("could not read google account email")
	// ErrGoogleCalendarOAuthRedisUnavailable is returned when Redis is required but not configured.
	ErrGoogleCalendarOAuthRedisUnavailable = errors.New("redis not configured")
	// ErrGoogleCalendarPickInvalid is returned when the pick-token session is missing or expired.
	ErrGoogleCalendarPickInvalid = errors.New("invalid or expired calendar selection session")
)

// GoogleCalendarOAuthStatePayload is stored in Redis for the Google OAuth redirect chain.
type GoogleCalendarOAuthStatePayload struct {
	CompanyID    string `json:"companyId"`
	UnitID       string `json:"unitId"`
	CodeVerifier string `json:"codeVerifier"`
	ReturnPath   string `json:"returnPath,omitempty"`
}

// GoogleCalendarPickPayload is stored in Redis after OAuth until the user chooses a calendar.
type GoogleCalendarPickPayload struct {
	CompanyID    string `json:"companyId"`
	UnitID       string `json:"unitId"`
	ReturnPath   string `json:"returnPath,omitempty"`
	RefreshToken string `json:"refreshToken"`
	Email        string `json:"email"`
}

// GoogleCalendarPickOption is one writable calendar from Google Calendar API list.
type GoogleCalendarPickOption struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Primary bool   `json:"primary"`
}

// googleCalendarOAuthEndpoint avoids importing golang.org/x/oauth2/google (which pulls GCP metadata deps).
var googleCalendarOAuthEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

func googleCalendarOAuthConfig() *oauth2.Config {
	cid := strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_OAUTH_CLIENT_ID"))
	sec := strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"))
	redir := strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_OAUTH_REDIRECT_URL"))
	if cid == "" || sec == "" || redir == "" {
		return nil
	}
	return &oauth2.Config{
		ClientID:     cid,
		ClientSecret: sec,
		RedirectURL:  redir,
		Endpoint:     googleCalendarOAuthEndpoint,
		Scopes: []string{
			"https://www.googleapis.com/auth/calendar",
			"https://www.googleapis.com/auth/userinfo.email",
		},
	}
}

func randomStateHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return strings.ReplaceAll(uuid.New().String(), "-", "")
	}
	return hex.EncodeToString(b)
}

// SanitizeInternalReturnPath validates a same-origin path for post-OAuth browser redirect.
func SanitizeInternalReturnPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/settings/integrations", nil
	}
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") {
		return "", fmt.Errorf("invalid return path")
	}
	if strings.Contains(p, "://") {
		return "", fmt.Errorf("invalid return path")
	}
	if strings.Contains(p, "..") {
		return "", fmt.Errorf("invalid return path")
	}
	clean := path.Clean(p)
	if clean == "." || strings.HasPrefix(clean, "/..") {
		return "", fmt.Errorf("invalid return path")
	}
	if len(clean) > 512 {
		return "", fmt.Errorf("invalid return path")
	}
	return clean, nil
}

// StartGoogleCalendarOAuth builds the Google authorize URL and stores PKCE state in Redis.
func (s *CalendarIntegrationService) StartGoogleCalendarOAuth(ctx context.Context, companyID, unitID, returnPath string) (authURL string, err error) {
	cfg := googleCalendarOAuthConfig()
	if cfg == nil {
		return "", ErrGoogleCalendarOAuthNotConfigured
	}
	unitID = strings.TrimSpace(unitID)
	if unitID == "" {
		return "", ErrGoogleCalendarOAuthUnitIDRequired
	}
	if err := s.VerifyUnitBelongsToCompany(unitID, companyID); err != nil {
		return "", err
	}
	n, err := s.repo.CountByUnitID(unitID)
	if err != nil {
		return "", err
	}
	if n >= MaxCalendarIntegrationsPerUnit {
		return "", ErrCalendarIntegrationLimit
	}
	retPath, err := SanitizeInternalReturnPath(returnPath)
	if err != nil {
		return "", err
	}
	rdb := redisstore.Client()
	if rdb == nil {
		return "", ErrGoogleCalendarOAuthRedisUnavailable
	}
	state := randomStateHex(24)
	verifier := oauth2.GenerateVerifier()
	payload := GoogleCalendarOAuthStatePayload{
		CompanyID:    companyID,
		UnitID:       unitID,
		CodeVerifier: verifier,
		ReturnPath:   retPath,
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarOAuthState(state), payload, 15*time.Minute); err != nil {
		return "", err
	}
	opts := []oauth2.AuthCodeOption{
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.S256ChallengeOption(verifier),
	}
	return cfg.AuthCodeURL(state, opts...), nil
}

// CompleteGoogleCalendarOAuth exchanges the code, stores a short-lived pick session, and redirects the browser
// with ?google_calendar_pick= so the admin UI can list calendars and call CompleteGoogleCalendarPick.
// On success successURL is set. On failure err is non-nil and failureReturnPath may be the path from OAuth state for UI redirect.
func (s *CalendarIntegrationService) CompleteGoogleCalendarOAuth(ctx context.Context, code, state string) (successURL string, failureReturnPath string, err error) {
	code = strings.TrimSpace(code)
	state = strings.TrimSpace(state)
	if code == "" || state == "" {
		return "", "", fmt.Errorf("missing code or state")
	}
	cfg := googleCalendarOAuthConfig()
	if cfg == nil {
		return "", "", ErrGoogleCalendarOAuthNotConfigured
	}
	var payload GoogleCalendarOAuthStatePayload
	if err := redisstore.GetAndDeleteJSON(ctx, redisstore.KeyGoogleCalendarOAuthState(state), &payload); err != nil {
		if errors.Is(err, redis.Nil) {
			return "", "", fmt.Errorf("invalid or expired oauth state")
		}
		return "", "", err
	}
	failureReturnPath = strings.TrimSpace(payload.ReturnPath)
	tok, err := cfg.Exchange(ctx, code, oauth2.VerifierOption(payload.CodeVerifier))
	if err != nil {
		return "", failureReturnPath, fmt.Errorf("token exchange: %w", err)
	}
	if strings.TrimSpace(tok.RefreshToken) == "" {
		return "", failureReturnPath, ErrGoogleCalendarOAuthNoRefreshToken
	}
	email, err := googleUserinfoEmail(ctx, tok.AccessToken)
	if err != nil {
		return "", failureReturnPath, err
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return "", failureReturnPath, ErrGoogleCalendarOAuthUserinfo
	}
	retPath := strings.TrimSpace(payload.ReturnPath)
	if retPath == "" {
		retPath = "/settings/integrations"
	}
	pickToken := randomStateHex(32)
	pick := GoogleCalendarPickPayload{
		CompanyID:    payload.CompanyID,
		UnitID:       payload.UnitID,
		ReturnPath:   retPath,
		RefreshToken: strings.TrimSpace(tok.RefreshToken),
		Email:        email,
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickToken), pick, 15*time.Minute); err != nil {
		return "", failureReturnPath, err
	}
	base := strings.TrimRight(PublicAppURL(), "/")
	out, err := url.Parse(base + retPath)
	if err != nil {
		return "", failureReturnPath, err
	}
	q := out.Query()
	q.Set("google_calendar_pick", pickToken)
	out.RawQuery = q.Encode()
	return out.String(), "", nil
}

// ListGooglePickCalendars returns writable calendars for a valid pick session (does not consume the session).
func (s *CalendarIntegrationService) ListGooglePickCalendars(ctx context.Context, companyID, pickToken string) ([]GoogleCalendarPickOption, error) {
	pickToken = strings.TrimSpace(pickToken)
	if pickToken == "" {
		return nil, ErrGoogleCalendarPickInvalid
	}
	var pay GoogleCalendarPickPayload
	if err := redisstore.GetJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickToken), &pay); err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrGoogleCalendarPickInvalid
		}
		return nil, err
	}
	if strings.TrimSpace(pay.CompanyID) != strings.TrimSpace(companyID) {
		return nil, ErrCalendarUnitCompanyMismatch
	}
	if err := s.VerifyUnitBelongsToCompany(pay.UnitID, companyID); err != nil {
		return nil, err
	}
	return listWritableGoogleCalendarsFromRefresh(ctx, pay.RefreshToken)
}

// CompleteGoogleCalendarPick consumes the pick session and creates the google_caldav integration for calendarID.
func (s *CalendarIntegrationService) CompleteGoogleCalendarPick(ctx context.Context, companyID, pickToken, calendarID string) (*CalendarIntegrationPublic, error) {
	pickToken = strings.TrimSpace(pickToken)
	calendarID = strings.TrimSpace(calendarID)
	if pickToken == "" || calendarID == "" {
		return nil, ErrGoogleCalendarPickInvalid
	}
	var pay GoogleCalendarPickPayload
	if err := redisstore.GetAndDeleteJSON(ctx, redisstore.KeyGoogleCalendarPickSession(pickToken), &pay); err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrGoogleCalendarPickInvalid
		}
		return nil, err
	}
	if strings.TrimSpace(pay.CompanyID) != strings.TrimSpace(companyID) {
		return nil, ErrCalendarUnitCompanyMismatch
	}
	if err := s.VerifyUnitBelongsToCompany(pay.UnitID, companyID); err != nil {
		return nil, err
	}
	n, err := s.repo.CountByUnitID(pay.UnitID)
	if err != nil {
		return nil, err
	}
	if n >= MaxCalendarIntegrationsPerUnit {
		return nil, ErrCalendarIntegrationLimit
	}
	return s.CreateGoogleIntegration(companyID, pay.UnitID, pay.RefreshToken, pay.Email, calendarID)
}

// GoogleCalendarOAuthFailureRedirect builds a safe redirect URL for OAuth callback errors.
func GoogleCalendarOAuthFailureRedirect(returnPath, reason string) string {
	ret, err := SanitizeInternalReturnPath(returnPath)
	if err != nil {
		ret = "/settings/integrations"
	}
	base := strings.TrimRight(PublicAppURL(), "/")
	u, err := url.Parse(base + ret)
	if err != nil {
		return base + "/settings/integrations?google_calendar=error&reason=" + url.QueryEscape(reason)
	}
	q := u.Query()
	q.Set("google_calendar", "error")
	q.Set("reason", reason)
	u.RawQuery = q.Encode()
	return u.String()
}

type googleUserinfoResponse struct {
	Email string `json:"email"`
}

func googleUserinfoEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("userinfo: %s", resp.Status)
	}
	var body googleUserinfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.Email, nil
}
