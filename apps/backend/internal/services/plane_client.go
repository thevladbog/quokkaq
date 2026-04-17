package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// PlaneHTTPError is returned when Plane responds with a non-2xx HTTP status (work items, project list).
type PlaneHTTPError struct {
	HTTPStatus int
	Body       string
}

func (e *PlaneHTTPError) Error() string {
	b := strings.TrimSpace(e.Body)
	const max = 512
	if len(b) > max {
		b = b[:max] + "..."
	}
	return fmt.Sprintf("plane request: HTTP %d: %s", e.HTTPStatus, b)
}

func newPlaneHTTPError(status int, body []byte) *PlaneHTTPError {
	const storeMax = 8192
	b := strings.TrimSpace(string(body))
	if len(b) > storeMax {
		log.Printf("plane api: HTTP %d response body (first %d of %d bytes)", status, storeMax, len(b))
		b = b[:storeMax]
	}
	return &PlaneHTTPError{
		HTTPStatus: status,
		Body:       b,
	}
}

// PlaneClient calls the Plane REST API (self-hosted or cloud).
type PlaneClient struct {
	baseURL       string
	apiKey        string
	workspaceSlug string
	// projectID is PLANE_PROJECT_ID (UUID). Work item URLs require this UUID.
	projectID string
	// projectRef is PLANE_PROJECT_IDENTIFIER or PLANE_PROJECT_SLUG (Plane API field "identifier", e.g. PROJ-123).
	// When projectID is empty, the client resolves projectRef to a UUID on the first Create/Get call via GET .../projects/.
	projectRef string
	httpClient *http.Client

	resolveMu  sync.Mutex
	resolvedID string
	resolveErr error
}

// newPlaneHTTPClientFromEnv returns an HTTP client for Plane only.
// PLANE_TLS_INSECURE_SKIP_VERIFY=true disables TLS certificate verification (dev / private CA only).
func newPlaneHTTPClientFromEnv() *http.Client {
	const timeout = 45 * time.Second
	skipVerify := false
	if v := strings.TrimSpace(os.Getenv("PLANE_TLS_INSECURE_SKIP_VERIFY")); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			skipVerify = b
		}
	}
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return &http.Client{Timeout: timeout}
	}
	t := base.Clone()
	if skipVerify {
		// Explicit opt-in for private Plane hosts (corporate CA / self-signed). Prefer installing the CA on the API server.
		t.TLSClientConfig = &tls.Config{ // #nosec G402 -- gated by PLANE_TLS_INSECURE_SKIP_VERIFY
			InsecureSkipVerify: true,
			MinVersion:         tls.VersionTLS12,
		}
	}
	return &http.Client{Timeout: timeout, Transport: t}
}

// NewPlaneClientFromEnv builds a client from PLANE_* environment variables.
func NewPlaneClientFromEnv() *PlaneClient {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("PLANE_BASE_URL")), "/")
	ref := strings.TrimSpace(os.Getenv("PLANE_PROJECT_IDENTIFIER"))
	if ref == "" {
		ref = strings.TrimSpace(os.Getenv("PLANE_PROJECT_SLUG"))
	}
	return &PlaneClient{
		baseURL:       base,
		apiKey:        strings.TrimSpace(os.Getenv("PLANE_API_KEY")),
		workspaceSlug: strings.TrimSpace(os.Getenv("PLANE_WORKSPACE_SLUG")),
		projectID:     strings.TrimSpace(os.Getenv("PLANE_PROJECT_ID")),
		projectRef:    ref,
		httpClient:    newPlaneHTTPClientFromEnv(),
	}
}

func planeGloballyDisabledViaEnv() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("PLANE_ENABLED"))) {
	case "false", "0", "no":
		return true
	default:
		return false
	}
}

// Enabled is true when all required settings are non-empty and PLANE_ENABLED is not explicitly false.
func (c *PlaneClient) Enabled() bool {
	if c == nil || planeGloballyDisabledViaEnv() {
		return false
	}
	return c.baseURL != "" && c.apiKey != "" && c.workspaceSlug != "" &&
		(strings.TrimSpace(c.projectID) != "" || strings.TrimSpace(c.projectRef) != "")
}

// IntegrationDisabledReason explains why Enabled() is false; empty when enabled.
func (c *PlaneClient) IntegrationDisabledReason() string {
	if c == nil {
		return "internal: Plane client is nil"
	}
	if c.Enabled() {
		return ""
	}
	if planeGloballyDisabledViaEnv() {
		return "PLANE_ENABLED is false (set SUPPORT_REPORT_PLATFORM=yandex_tracker or turn Plane on for plane)"
	}
	if strings.TrimSpace(c.baseURL) == "" {
		return "PLANE_BASE_URL is missing or empty"
	}
	if strings.TrimSpace(c.apiKey) == "" {
		return "PLANE_API_KEY is missing or empty"
	}
	if strings.TrimSpace(c.workspaceSlug) == "" {
		return "PLANE_WORKSPACE_SLUG is missing or empty"
	}
	if strings.TrimSpace(c.projectID) == "" && strings.TrimSpace(c.projectRef) == "" {
		return "set PLANE_PROJECT_ID or PLANE_PROJECT_IDENTIFIER (or PLANE_PROJECT_SLUG)"
	}
	return "Plane is not fully configured"
}

// effectiveProjectID returns the project UUID for .../projects/{uuid}/work-items/ URLs.
func (c *PlaneClient) effectiveProjectID(ctx context.Context) (string, error) {
	c.resolveMu.Lock()
	defer c.resolveMu.Unlock()
	if c.resolveErr != nil {
		return "", c.resolveErr
	}
	if c.resolvedID != "" {
		return c.resolvedID, nil
	}
	if pid := strings.TrimSpace(c.projectID); pid != "" {
		c.resolvedID = pid
		return pid, nil
	}
	ref := strings.TrimSpace(c.projectRef)
	if ref == "" {
		return "", fmt.Errorf("plane integration is not configured")
	}
	id, err := c.fetchProjectUUIDByRef(ctx, ref)
	if err != nil {
		c.resolveErr = err
		return "", err
	}
	c.resolvedID = id
	return id, nil
}

type planeProjectsListEnvelope struct {
	Results []struct {
		ID         string `json:"id"`
		Identifier string `json:"identifier"`
	} `json:"results"`
	NextCursor      *string `json:"next_cursor"`
	NextPageResults bool    `json:"next_page_results"`
}

func (c *PlaneClient) fetchProjectUUIDByRef(ctx context.Context, ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	cursor := ""
	for page := 0; page < 50; page++ {
		u, err := url.Parse(fmt.Sprintf("%s/api/v1/workspaces/%s/projects/", c.baseURL, url.PathEscape(c.workspaceSlug)))
		if err != nil {
			return "", fmt.Errorf("plane list projects url: %w", err)
		}
		q := u.Query()
		q.Set("per_page", "100")
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		u.RawQuery = q.Encode()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("X-API-Key", c.apiKey)

		res, err := c.httpClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("plane GET projects: %w", err)
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
		_ = res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return "", newPlaneHTTPError(res.StatusCode, body)
		}
		var env planeProjectsListEnvelope
		if err := json.Unmarshal(body, &env); err != nil {
			return "", fmt.Errorf("plane projects list json: %w", err)
		}
		for _, p := range env.Results {
			if strings.EqualFold(strings.TrimSpace(p.ID), ref) {
				return strings.TrimSpace(p.ID), nil
			}
			if strings.EqualFold(strings.TrimSpace(p.Identifier), ref) {
				return strings.TrimSpace(p.ID), nil
			}
		}
		if !env.NextPageResults || env.NextCursor == nil || strings.TrimSpace(*env.NextCursor) == "" {
			break
		}
		cursor = strings.TrimSpace(*env.NextCursor)
	}
	return "", fmt.Errorf("plane: no project matches %q — set PLANE_PROJECT_ID to the project UUID, or PLANE_PROJECT_IDENTIFIER to the project's identifier (see GET /workspaces/.../projects/)", ref)
}

// planeWorkItemResponse is a subset of Plane JSON for create/get work item.
type planeWorkItemResponse struct {
	ID          string          `json:"id"`
	SequenceID  int             `json:"sequence_id"`
	State       json.RawMessage `json:"state"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
}

func planeStateName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var asObj struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &asObj); err == nil && strings.TrimSpace(asObj.Name) != "" {
		return strings.TrimSpace(asObj.Name)
	}
	return ""
}

// CreateWorkItem creates a work item and returns Plane id, human sequence id, and state label if present.
// extras is unused for Plane (reserved for SupportReportTicketClient parity with Yandex Tracker).
func (c *PlaneClient) CreateWorkItem(ctx context.Context, externalID, title, descriptionHTML string, _ SupportReportTicketCreateExtras) (workItemID string, sequenceID *int, stateName string, err error) {
	if !c.Enabled() {
		return "", nil, "", fmt.Errorf("plane integration is not configured")
	}
	projectUUID, err := c.effectiveProjectID(ctx)
	if err != nil {
		return "", nil, "", err
	}
	u := fmt.Sprintf("%s/api/v1/workspaces/%s/projects/%s/work-items/", c.baseURL, c.workspaceSlug, projectUUID)
	payload := map[string]interface{}{
		"name":             title,
		"description_html": descriptionHTML,
		"external_id":      externalID,
		"external_source":  "quokkaq",
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return "", nil, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(buf))
	if err != nil {
		return "", nil, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)

	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", nil, "", err
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", nil, "", newPlaneHTTPError(res.StatusCode, body)
	}
	var out planeWorkItemResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", nil, "", fmt.Errorf("plane response json: %w", err)
	}
	if strings.TrimSpace(out.ID) == "" {
		return "", nil, "", fmt.Errorf("plane response missing work item id")
	}
	seq := out.SequenceID
	if seq > 0 {
		sequenceID = &seq
	}
	return out.ID, sequenceID, planeStateName(out.State), nil
}

// GetWorkItem fetches a work item with expanded state.
func (c *PlaneClient) GetWorkItem(ctx context.Context, workItemID string) (sequenceID *int, stateName string, err error) {
	if !c.Enabled() {
		return nil, "", fmt.Errorf("plane integration is not configured")
	}
	projectUUID, err := c.effectiveProjectID(ctx)
	if err != nil {
		return nil, "", err
	}
	u := fmt.Sprintf("%s/api/v1/workspaces/%s/projects/%s/work-items/%s/?expand=state", c.baseURL, c.workspaceSlug, projectUUID, workItemID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, "", newPlaneHTTPError(res.StatusCode, body)
	}
	var out planeWorkItemResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, "", err
	}
	if out.SequenceID > 0 {
		s := out.SequenceID
		sequenceID = &s
	}
	return sequenceID, planeStateName(out.State), nil
}

// AddComment is not implemented for Plane (no stable comment API in this integration).
func (c *PlaneClient) AddComment(context.Context, string, string) error {
	return nil
}

// BuildSupportDescriptionHTML escapes user text and appends optional diagnostics block.
func BuildSupportDescriptionHTML(description string, diagnosticsJSON []byte, traceID string) string {
	var b strings.Builder
	esc := html.EscapeString(description)
	esc = strings.ReplaceAll(esc, "\n", "<br/>")
	b.WriteString("<p>")
	b.WriteString(esc)
	b.WriteString("</p>")
	if strings.TrimSpace(traceID) != "" {
		b.WriteString("<p><strong>trace_id</strong>: ")
		b.WriteString(html.EscapeString(strings.TrimSpace(traceID)))
		b.WriteString("</p>")
	}
	if len(diagnosticsJSON) > 0 {
		b.WriteString("<h4>Diagnostics</h4><pre>")
		b.WriteString(html.EscapeString(string(diagnosticsJSON)))
		b.WriteString("</pre>")
	}
	return b.String()
}
