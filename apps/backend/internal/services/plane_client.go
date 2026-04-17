package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// PlaneClient calls the Plane REST API (self-hosted or cloud).
type PlaneClient struct {
	baseURL       string
	apiKey        string
	workspaceSlug string
	projectID     string
	httpClient    *http.Client
}

// NewPlaneClientFromEnv builds a client from PLANE_* environment variables.
func NewPlaneClientFromEnv() *PlaneClient {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("PLANE_BASE_URL")), "/")
	return &PlaneClient{
		baseURL:       base,
		apiKey:        strings.TrimSpace(os.Getenv("PLANE_API_KEY")),
		workspaceSlug: strings.TrimSpace(os.Getenv("PLANE_WORKSPACE_SLUG")),
		projectID:     strings.TrimSpace(os.Getenv("PLANE_PROJECT_ID")),
		httpClient:    &http.Client{Timeout: 45 * time.Second},
	}
}

// Enabled is true when all required settings are non-empty.
func (c *PlaneClient) Enabled() bool {
	return c != nil && c.baseURL != "" && c.apiKey != "" && c.workspaceSlug != "" && c.projectID != ""
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
func (c *PlaneClient) CreateWorkItem(ctx context.Context, externalID, title, descriptionHTML string) (workItemID string, sequenceID *int, stateName string, err error) {
	if !c.Enabled() {
		return "", nil, "", fmt.Errorf("plane integration is not configured")
	}
	u := fmt.Sprintf("%s/api/v1/workspaces/%s/projects/%s/work-items/", c.baseURL, c.workspaceSlug, c.projectID)
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
		return "", nil, "", fmt.Errorf("plane POST work-items: status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
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
	u := fmt.Sprintf("%s/api/v1/workspaces/%s/projects/%s/work-items/%s/?expand=state", c.baseURL, c.workspaceSlug, c.projectID, workItemID)
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
		return nil, "", fmt.Errorf("plane GET work-item: status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
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
