package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"text/template"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/ssocrypto"
	"quokkaq-go-backend/internal/repository"

	"github.com/tidwall/gjson"
	"gorm.io/gorm"
)

// Employee idP resolve (kiosk / staff).
var (
	ErrEmployeeIdpDisabled    = errors.New("employee idp is not enabled for this unit")
	ErrEmployeeIdpPlan        = errors.New("plan does not include kiosk employee idp")
	ErrEmployeeIdpBadUpstream = errors.New("invalid or disallowed upstream URL")
	ErrEmployeeIdpUpstream    = errors.New("upstream idp request failed")
	ErrEmployeeIdpMap         = errors.New("could not map upstream response to user")
	ErrEmployeeIdpEmptyInput  = errors.New("raw credential is required")
)

var reSecretRef = regexp.MustCompile(`\$\{secret:([^}]+)\}`)

// EmployeeIdpService resolves raw badge / login input via the tenant's HTTPS IdP.
type EmployeeIdpService struct {
	unitRepo   repository.UnitRepository
	userRepo   repository.UserRepository
	idpRepo    *repository.EmployeeIdpRepository
	httpClient *http.Client
}

func NewEmployeeIdpService(
	unitRepo repository.UnitRepository,
	userRepo repository.UserRepository,
	idpRepo *repository.EmployeeIdpRepository,
) *EmployeeIdpService {
	return &EmployeeIdpService{
		unitRepo: unitRepo,
		userRepo: userRepo,
		idpRepo:  idpRepo,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
				MaxIdleConns:          8,
				IdleConnTimeout:       30 * time.Second,
				ResponseHeaderTimeout: 20 * time.Second,
			},
		},
	}
}

// EmployeeIdpResolveRequest is the JSON for POST /public/.../employee-idp/resolve
type EmployeeIdpResolveRequest struct {
	Kind string `json:"kind"` // "badge" | "login"
	Raw  string `json:"raw"`
}

// EmployeeIdpResolveResponse is safe for the browser (no upstream body).
type EmployeeIdpResolveResponse struct {
	MatchStatus string `json:"matchStatus"` // "matched" | "no_user" | "ambiguous"
	UserID      string `json:"userId,omitempty"`
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
}

// ResolveKiosk looks up a user; kind badge uses .Raw, login uses .Login in templates.
func (s *EmployeeIdpService) ResolveKiosk(ctx context.Context, unitID string, body EmployeeIdpResolveRequest) (*EmployeeIdpResolveResponse, error) {
	raw := strings.TrimSpace(body.Raw)
	if raw == "" {
		return nil, ErrEmployeeIdpEmptyInput
	}
	kind := strings.TrimSpace(strings.ToLower(body.Kind))
	if kind != "badge" && kind != "login" {
		return nil, fmt.Errorf("kind: must be badge or login")
	}

	unit, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return nil, err
	}
	ok, perr := CompanyHasPlanFeature(unit.CompanyID, PlanFeatureKioskEmployeeIdp)
	if perr != nil {
		return nil, perr
	}
	if !ok {
		return nil, ErrEmployeeIdpPlan
	}
	set, err := s.idpRepo.GetSettingByUnitID(unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrEmployeeIdpDisabled
		}
		return nil, err
	}
	if !set.Enabled {
		return nil, ErrEmployeeIdpDisabled
	}

	email, disp, err := s.callUpstream(ctx, set, kind, raw)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(email) == "" {
		return &EmployeeIdpResolveResponse{MatchStatus: "no_user"}, nil
	}
	n, err := s.userRepo.CountUsersInCompanyByEmail(unit.CompanyID, email)
	if err != nil {
		return nil, err
	}
	if n > 1 {
		return &EmployeeIdpResolveResponse{MatchStatus: "ambiguous", Email: email, DisplayName: disp}, nil
	}
	if n == 0 {
		return &EmployeeIdpResolveResponse{MatchStatus: "no_user", Email: email, DisplayName: disp}, nil
	}
	u, err := s.userRepo.FindUserInCompanyByEmail(unit.CompanyID, email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &EmployeeIdpResolveResponse{MatchStatus: "no_user", Email: email, DisplayName: disp}, nil
		}
		return nil, err
	}
	name := u.Name
	if strings.TrimSpace(disp) != "" {
		name = disp
	}
	return &EmployeeIdpResolveResponse{
		MatchStatus: "matched",
		UserID:      u.ID,
		Email:       stringFromPtr(u.Email),
		DisplayName: name,
	}, nil
}

func stringFromPtr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *EmployeeIdpService) callUpstream(ctx context.Context, set *models.UnitEmployeeIdpSetting, kind, raw string) (email, displayName string, err error) {
	u, err := urlParseAllowed(set.UpstreamURL)
	if err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrEmployeeIdpBadUpstream, err)
	}
	if u.Scheme != "https" {
		return "", "", ErrEmployeeIdpBadUpstream
	}
	if employeeIdpForbiddenUpstreamHost(u.Hostname()) {
		return "", "", ErrEmployeeIdpBadUpstream
	}

	secrets, err := s.idpRepo.ListSecrets(set.UnitID)
	if err != nil {
		return "", "", err
	}
	secretMap := make(map[string]string)
	for i := range secrets {
		plain, decErr := ssocrypto.DecryptAES256GCM(secrets[i].Ciphertext)
		if decErr != nil {
			return "", "", decErr
		}
		secretMap[secrets[i].Name] = string(plain)
	}

	tplData := struct {
		Raw   string
		Login string
		Kind  string
		Ts    int64
	}{Raw: raw, Login: raw, Kind: kind, Ts: time.Now().Unix()}

	method := strings.ToUpper(strings.TrimSpace(set.HTTPMethod))
	if method == "" {
		method = http.MethodPost
	}
	var bodyStr string
	if method != http.MethodGet {
		tmpl, err := template.New("idp").Parse(strings.TrimSpace(set.RequestBodyTemplate))
		if err != nil {
			return "", "", err
		}
		var bodyBuf bytes.Buffer
		if err := tmpl.Execute(&bodyBuf, tplData); err != nil {
			return "", "", err
		}
		bodyStr = strings.TrimSpace(bodyBuf.String())
		if bodyStr == "" {
			bodyStr = "{}"
		}
	}
	var bodyReader io.Reader
	if method != http.MethodGet && bodyStr != "" {
		bodyReader = bytes.NewReader([]byte(bodyStr))
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), bodyReader)
	if err != nil {
		return "", "", err
	}
	if err := applyHeaderTemplates(req, set.HeaderTemplatesJSON, secretMap); err != nil {
		return "", "", err
	}
	if req.Header.Get("Content-Type") == "" && method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	to := time.Duration(set.TimeoutMS) * time.Millisecond
	if to < 1*time.Second || to > 60*time.Second {
		to = 10 * time.Second
	}
	cctx, cancel := context.WithTimeout(ctx, to)
	defer cancel()
	req = req.WithContext(cctx)

	res, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrEmployeeIdpUpstream, err)
	}
	defer func() {
		if cErr := res.Body.Close(); cErr != nil && err == nil {
			err = fmt.Errorf("%w: %v", ErrEmployeeIdpUpstream, cErr)
		}
	}()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return "", "", fmt.Errorf("%w: status %d", ErrEmployeeIdpUpstream, res.StatusCode)
	}
	gs := gjson.ParseBytes(b)
	email = strings.TrimSpace(gs.Get(set.ResponseEmailPath).String())
	displayName = strings.TrimSpace(gs.Get(set.ResponseDisplayNamePath).String())
	if set.ResponseEmailPath == "" {
		return "", displayName, ErrEmployeeIdpMap
	}
	return email, displayName, nil
}

type headerKV struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func applyHeaderTemplates(req *http.Request, headerJSON string, secrets map[string]string) error {
	var list []headerKV
	if err := json.Unmarshal([]byte(headerJSON), &list); err != nil {
		return err
	}
	for _, h := range list {
		if strings.TrimSpace(h.Name) == "" {
			continue
		}
		v := reSecretRef.ReplaceAllStringFunc(h.Value, func(m string) string {
			sub := reSecretRef.FindStringSubmatch(m)
			if len(sub) != 2 {
				return m
			}
			return secrets[strings.TrimSpace(sub[1])]
		})
		req.Header.Set(h.Name, v)
	}
	return nil
}

// employeeIdpForbiddenUpstreamHost is the SSRF check for IdP base URLs. Tests may swap it to use httptest loopback (restore in t.Cleanup, avoid t.Parallel with overrides).
var employeeIdpForbiddenUpstreamHost = func(host string) bool { return forbiddenUpstreamHost(host) }

// forbiddenUpstreamHost blocks loopback, literal private IPs, and hostnames that resolve only to private/loopback addresses.
func forbiddenUpstreamHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" || host == "localhost" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return true
	}
	for _, ip := range ips {
		if ip == nil {
			continue
		}
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

func urlParseAllowed(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return nil, err
	}
	return u, nil
}
