package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/sso/redisstore"

	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// Microsoft Calendar OAuth (admin): env MICROSOFT_CALENDAR_OAUTH_CLIENT_ID,
// MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET, MICROSOFT_CALENDAR_OAUTH_REDIRECT_URL.

var (
	ErrMicrosoftCalendarOAuthNotConfigured  = errors.New("microsoft calendar oauth is not configured on this server")
	ErrMicrosoftCalendarOAuthNoRefreshToken = errors.New("microsoft did not return a refresh token; try consent again")
	ErrMicrosoftCalendarOAuthUserinfo       = errors.New("could not read microsoft account identity")
)

var microsoftOAuthHTTPClient = &http.Client{Timeout: 20 * time.Second}

// MicrosoftCalendarOAuthStatePayload is stored in Redis for the Microsoft OAuth redirect chain.
type MicrosoftCalendarOAuthStatePayload struct {
	CompanyID    string `json:"companyId"`
	UnitID       string `json:"unitId"`
	CodeVerifier string `json:"codeVerifier"`
	ReturnPath   string `json:"returnPath,omitempty"`
}

func microsoftOAuth2Config() *oauth2.Config {
	cid := strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_OAUTH_CLIENT_ID"))
	sec := strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET"))
	redir := strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_OAUTH_REDIRECT_URL"))
	if cid == "" || sec == "" || redir == "" {
		return nil
	}
	return &oauth2.Config{
		ClientID:     cid,
		ClientSecret: sec,
		RedirectURL:  redir,
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			TokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		},
		Scopes: []string{
			"offline_access",
			"https://graph.microsoft.com/Calendars.ReadWrite",
			"https://graph.microsoft.com/User.Read",
		},
	}
}

// StartMicrosoftCalendarOAuth builds the Microsoft authorize URL and stores PKCE state in Redis.
func (s *CalendarIntegrationService) StartMicrosoftCalendarOAuth(ctx context.Context, companyID, unitID, returnPath string) (authURL string, err error) {
	cfg := microsoftOAuth2Config()
	if cfg == nil {
		return "", ErrMicrosoftCalendarOAuthNotConfigured
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
	state, err := randomStateHex(24)
	if err != nil {
		return "", err
	}
	verifier := oauth2.GenerateVerifier()
	payload := MicrosoftCalendarOAuthStatePayload{
		CompanyID:    companyID,
		UnitID:       unitID,
		CodeVerifier: verifier,
		ReturnPath:   retPath,
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyMicrosoftCalendarOAuthState(state), payload, 15*time.Minute); err != nil {
		logger.ErrorfCtx(ctx, "microsoft calendar oauth: state save failed companyId=%s unitId=%s err=%v", companyID, unitID, err)
		return "", fmt.Errorf("%w: %v", ErrGoogleCalendarOAuthSessionSaveFailed, err)
	}
	opts := []oauth2.AuthCodeOption{
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.S256ChallengeOption(verifier),
	}
	return cfg.AuthCodeURL(state, opts...), nil
}

// CompleteMicrosoftCalendarOAuth exchanges the code and creates a microsoft_graph integration row.
func (s *CalendarIntegrationService) CompleteMicrosoftCalendarOAuth(ctx context.Context, code, state string) (successURL string, failureReturnPath string, err error) {
	code = strings.TrimSpace(code)
	state = strings.TrimSpace(state)
	if code == "" || state == "" {
		return "", "", fmt.Errorf("missing code or state")
	}
	cfg := microsoftOAuth2Config()
	if cfg == nil {
		return "", "", ErrMicrosoftCalendarOAuthNotConfigured
	}
	var payload MicrosoftCalendarOAuthStatePayload
	if err := redisstore.GetAndDeleteJSON(ctx, redisstore.KeyMicrosoftCalendarOAuthState(state), &payload); err != nil {
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
		return "", failureReturnPath, ErrMicrosoftCalendarOAuthNoRefreshToken
	}
	access := strings.TrimSpace(tok.AccessToken)
	if access == "" {
		return "", failureReturnPath, ErrMicrosoftCalendarOAuthNoRefreshToken
	}
	upn, calID, err := microsoftGraphMeAndDefaultCalendar(ctx, access)
	if err != nil {
		return "", failureReturnPath, err
	}
	if upn == "" {
		return "", failureReturnPath, ErrMicrosoftCalendarOAuthUserinfo
	}
	if calID == "" {
		calID = "primary"
	}
	retPath := strings.TrimSpace(payload.ReturnPath)
	if retPath == "" {
		retPath = "/settings/integrations"
	}
	if _, err := s.CreateMicrosoftGraphIntegration(payload.CompanyID, payload.UnitID, tok.RefreshToken, calID, upn); err != nil {
		return "", failureReturnPath, err
	}
	base := strings.TrimRight(PublicAppURL(), "/")
	out, err := url.Parse(base + retPath)
	if err != nil {
		return "", failureReturnPath, err
	}
	q := out.Query()
	q.Set("microsoft_calendar", "connected")
	out.RawQuery = q.Encode()
	return out.String(), "", nil
}

func microsoftGraphMeAndDefaultCalendar(ctx context.Context, accessToken string) (upn string, calendarID string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me", nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := microsoftOAuthHTTPClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", "", fmt.Errorf("graph /me: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var me map[string]interface{}
	if err := json.Unmarshal(b, &me); err != nil {
		return "", "", err
	}
	upn, _ = me["userPrincipalName"].(string)
	if strings.TrimSpace(upn) == "" {
		upn, _ = me["mail"].(string)
	}
	req2, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me/calendar", nil)
	if err != nil {
		return strings.TrimSpace(upn), "", err
	}
	req2.Header.Set("Authorization", "Bearer "+accessToken)
	resp2, err := microsoftOAuthHTTPClient.Do(req2)
	if err != nil {
		return strings.TrimSpace(upn), "", err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp2.Body); _ = resp2.Body.Close() }()
	b2, _ := io.ReadAll(resp2.Body)
	if resp2.StatusCode < 200 || resp2.StatusCode > 299 {
		return strings.TrimSpace(upn), "", nil
	}
	var cal map[string]interface{}
	if err := json.Unmarshal(b2, &cal); err != nil {
		return strings.TrimSpace(upn), "", nil
	}
	if id, ok := cal["id"].(string); ok {
		calendarID = strings.TrimSpace(id)
	}
	return strings.TrimSpace(upn), calendarID, nil
}

// MicrosoftCalendarOAuthFailureRedirect builds a safe redirect URL for Microsoft OAuth callback errors.
func MicrosoftCalendarOAuthFailureRedirect(returnPath, reason string) string {
	ret, err := SanitizeInternalReturnPath(returnPath)
	if err != nil {
		ret = "/settings/integrations"
	}
	base := strings.TrimRight(PublicAppURL(), "/")
	u, err := url.Parse(base + ret)
	if err != nil {
		return base + "/settings/integrations?microsoft_calendar=error&reason=" + url.QueryEscape(reason)
	}
	q := u.Query()
	q.Set("microsoft_calendar", "error")
	q.Set("reason", reason)
	u.RawQuery = q.Encode()
	return u.String()
}
