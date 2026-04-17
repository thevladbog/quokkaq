package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// YandexTrackerHTTPError is returned when Tracker API responds with a non-2xx status.
type YandexTrackerHTTPError struct {
	HTTPStatus int
	Body       string
}

func (e *YandexTrackerHTTPError) Error() string {
	b := strings.TrimSpace(e.Body)
	const max = 512
	if len(b) > max {
		b = b[:max] + "..."
	}
	return fmt.Sprintf("yandex tracker request: HTTP %d: %s", e.HTTPStatus, b)
}

func newYandexTrackerHTTPError(status int, body []byte) *YandexTrackerHTTPError {
	const storeMax = 8192
	b := strings.TrimSpace(string(body))
	if len(b) > storeMax {
		log.Printf("yandex tracker api: HTTP %d response body (first %d of %d bytes)", status, storeMax, len(b))
		b = b[:storeMax]
	}
	return &YandexTrackerHTTPError{
		HTTPStatus: status,
		Body:       b,
	}
}

// YandexTrackerClient calls Yandex Tracker REST API v3.
type YandexTrackerClient struct {
	baseURL       string
	token         string
	authScheme    string
	orgID         string
	useCloudOrgID bool
	queueKey      string
	httpClient    *http.Client
	iam           *yandexTrackerIAM // when YANDEX_TRACKER_SA_KEY_FILE is set; Bearer IAM via Yandex Cloud SDK
}

// NewYandexTrackerClientFromEnv builds a client from YANDEX_TRACKER_* variables.
// YANDEX_TRACKER_SA_KEY_FILE: optional path to service account authorized key JSON; when set, IAM Bearer
// is obtained via github.com/yandex-cloud/go-sdk/v2 (see Yandex Cloud IAM docs) and YANDEX_TRACKER_TOKEN is ignored for Tracker calls.
// YANDEX_TRACKER_TOKEN: OAuth user token or static IAM token (when SA key file is not set).
// YANDEX_TRACKER_AUTH_SCHEME: "OAuth" (default) or "Bearer" (static IAM); ignored when SA key file is set (always Bearer + rotating IAM).
// YANDEX_TRACKER_ORG_ID: organization id (header X-Org-ID or X-Cloud-Org-ID).
// YANDEX_TRACKER_USE_CLOUD_ORG_ID: if true, send X-Cloud-Org-ID instead of X-Org-ID.
// YANDEX_TRACKER_QUEUE: queue key string.
// YANDEX_TRACKER_API_BASE: optional override, default https://api.tracker.yandex.net
func NewYandexTrackerClientFromEnv() *YandexTrackerClient {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("YANDEX_TRACKER_API_BASE")), "/")
	if base == "" {
		base = "https://api.tracker.yandex.net"
	}
	scheme := strings.TrimSpace(os.Getenv("YANDEX_TRACKER_AUTH_SCHEME"))
	if scheme == "" {
		scheme = "OAuth"
	}
	useCloud := false
	if v := strings.TrimSpace(os.Getenv("YANDEX_TRACKER_USE_CLOUD_ORG_ID")); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			useCloud = b
		}
	}
	var iam *yandexTrackerIAM
	if p := strings.TrimSpace(os.Getenv("YANDEX_TRACKER_SA_KEY_FILE")); p != "" {
		iam = newYandexTrackerIAM(p)
	}
	return &YandexTrackerClient{
		baseURL:       base,
		token:         strings.TrimSpace(os.Getenv("YANDEX_TRACKER_TOKEN")),
		authScheme:    scheme,
		orgID:         strings.TrimSpace(os.Getenv("YANDEX_TRACKER_ORG_ID")),
		useCloudOrgID: useCloud,
		queueKey:      strings.TrimSpace(os.Getenv("YANDEX_TRACKER_QUEUE")),
		httpClient:    &http.Client{Timeout: 45 * time.Second},
		iam:           iam,
	}
}

func (c *YandexTrackerClient) yandexTrackerIntegrationReady() (ok bool, reason string) {
	if c == nil {
		return false, "internal: Yandex Tracker client is nil"
	}
	if strings.TrimSpace(c.baseURL) == "" {
		return false, "YANDEX_TRACKER_API_BASE is empty"
	}
	if strings.TrimSpace(c.orgID) == "" {
		return false, "YANDEX_TRACKER_ORG_ID is missing or empty"
	}
	if strings.TrimSpace(c.queueKey) == "" {
		return false, "YANDEX_TRACKER_QUEUE is missing or empty"
	}
	if c.iam != nil {
		if !c.iam.keyFileOK() {
			return false, "YANDEX_TRACKER_SA_KEY_FILE is set but the file is missing or not readable from the API process cwd"
		}
		return true, ""
	}
	if strings.TrimSpace(c.token) == "" {
		return false, "YANDEX_TRACKER_TOKEN is empty (or set a readable YANDEX_TRACKER_SA_KEY_FILE for IAM)"
	}
	return true, ""
}

// Enabled is true when required settings are present.
func (c *YandexTrackerClient) Enabled() bool {
	ok, _ := c.yandexTrackerIntegrationReady()
	return ok
}

// IntegrationDisabledReason explains why Enabled() is false; empty when enabled.
func (c *YandexTrackerClient) IntegrationDisabledReason() string {
	ok, reason := c.yandexTrackerIntegrationReady()
	if ok {
		return ""
	}
	return reason
}

func (c *YandexTrackerClient) setOrgHeader(req *http.Request) {
	if c.useCloudOrgID {
		req.Header.Set("X-Cloud-Org-ID", c.orgID)
	} else {
		req.Header.Set("X-Org-ID", c.orgID)
	}
}

func (c *YandexTrackerClient) setAuth(req *http.Request) error {
	if c.iam != nil {
		tok, err := c.iam.bearerToken(req.Context())
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		return nil
	}
	req.Header.Set("Authorization", c.authScheme+" "+c.token)
	return nil
}

// BuildSupportDescriptionMarkdown builds issue description for Tracker (markupType md).
func BuildSupportDescriptionMarkdown(description string, diagnosticsJSON []byte, traceID string) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(description))
	if tid := strings.TrimSpace(traceID); tid != "" {
		b.WriteString("\n\n**trace_id**: `")
		b.WriteString(strings.ReplaceAll(tid, "`", "'"))
		b.WriteString("`")
	}
	if len(diagnosticsJSON) > 0 {
		b.WriteString("\n\n### Diagnostics\n\n```json\n")
		b.WriteString(strings.TrimSpace(string(diagnosticsJSON)))
		b.WriteString("\n```")
	}
	return b.String()
}

type ytIssue struct {
	ID     string `json:"id"`
	Key    string `json:"key"`
	Status struct {
		Display string `json:"display"`
	} `json:"status"`
}

func parseYandexTrackerIssueFromCreate(body []byte) (*ytIssue, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, fmt.Errorf("yandex tracker: empty create response")
	}
	if body[0] == '[' {
		var arr []ytIssue
		if err := json.Unmarshal(body, &arr); err != nil {
			return nil, fmt.Errorf("yandex tracker create json array: %w", err)
		}
		if len(arr) == 0 {
			return nil, fmt.Errorf("yandex tracker: empty issue array in create response")
		}
		if strings.TrimSpace(arr[0].Key) == "" {
			return nil, fmt.Errorf("yandex tracker: create response missing issue key")
		}
		return &arr[0], nil
	}
	var one ytIssue
	if err := json.Unmarshal(body, &one); err != nil {
		return nil, fmt.Errorf("yandex tracker create json: %w", err)
	}
	if strings.TrimSpace(one.Key) == "" {
		return nil, fmt.Errorf("yandex tracker: create response missing issue key")
	}
	return &one, nil
}

func sequenceFromIssueKey(key string) *int {
	key = strings.TrimSpace(key)
	i := strings.LastIndex(key, "-")
	if i < 0 || i+1 >= len(key) {
		return nil
	}
	n, err := strconv.Atoi(key[i+1:])
	if err != nil || n < 0 {
		return nil
	}
	return &n
}

const (
	yandexTrackerFieldAPIAccessToTicket  = "apiAccessToTheTicket"
	yandexTrackerFieldApplicantsEmailAPI = "applicantsEmailApi"
	yandexTrackerFieldCompany            = "company"
)

// CreateWorkItem creates a Tracker issue; descriptionPayload should be markdown when using markupType md.
// extras populate optional Tracker local fields (apiAccessToTheTicket, applicantsEmailApi, company).
func (c *YandexTrackerClient) CreateWorkItem(ctx context.Context, externalID, title, descriptionPayload string, extras SupportReportTicketCreateExtras) (workItemID string, sequenceID *int, stateName string, err error) {
	if !c.Enabled() {
		return "", nil, "", fmt.Errorf("yandex tracker integration is not configured")
	}
	u := c.baseURL + "/v3/issues/"
	payload := map[string]interface{}{
		"queue":       c.queueKey,
		"summary":     title,
		"description": descriptionPayload,
		"markupType":  "md",
	}
	if v := strings.TrimSpace(extras.ApiAccessToTicket); v != "" {
		payload[yandexTrackerFieldAPIAccessToTicket] = v
	}
	if v := strings.TrimSpace(extras.ApplicantsEmail); v != "" {
		payload[yandexTrackerFieldApplicantsEmailAPI] = v
	}
	if v := strings.TrimSpace(extras.CompanyTrackerLabel); v != "" {
		payload[yandexTrackerFieldCompany] = v
	}
	if strings.TrimSpace(externalID) != "" {
		payload["unique"] = externalID
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
	if err := c.setAuth(req); err != nil {
		return "", nil, "", err
	}
	c.setOrgHeader(req)

	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", nil, "", err
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", nil, "", newYandexTrackerHTTPError(res.StatusCode, body)
	}
	iss, err := parseYandexTrackerIssueFromCreate(body)
	if err != nil {
		return "", nil, "", err
	}
	seq := sequenceFromIssueKey(iss.Key)
	return iss.Key, seq, strings.TrimSpace(iss.Status.Display), nil
}

func (c *YandexTrackerClient) issueGETBytes(ctx context.Context, workItemID string) ([]byte, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("yandex tracker integration is not configured")
	}
	workItemID = strings.TrimSpace(workItemID)
	if workItemID == "" {
		return nil, fmt.Errorf("yandex tracker: empty issue id or key")
	}
	u := c.baseURL + "/v3/issues/" + url.PathEscape(workItemID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if err := c.setAuth(req); err != nil {
		return nil, err
	}
	c.setOrgHeader(req)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, newYandexTrackerHTTPError(res.StatusCode, body)
	}
	return body, nil
}

// GetWorkItem fetches issue by id or key.
func (c *YandexTrackerClient) GetWorkItem(ctx context.Context, workItemID string) (sequenceID *int, stateName string, err error) {
	body, err := c.issueGETBytes(ctx, workItemID)
	if err != nil {
		return nil, "", err
	}
	var iss ytIssue
	if err := json.Unmarshal(body, &iss); err != nil {
		return nil, "", fmt.Errorf("yandex tracker get json: %w", err)
	}
	key := strings.TrimSpace(iss.Key)
	if key == "" {
		key = strings.TrimSpace(workItemID)
	}
	seq := sequenceFromIssueKey(key)
	return seq, strings.TrimSpace(iss.Status.Display), nil
}

// PatchIssueAPIAccessToTicket sets the Tracker local field apiAccessToTheTicket using optimistic locking when the GET issue payload includes version.
func (c *YandexTrackerClient) PatchIssueAPIAccessToTicket(ctx context.Context, workItemID, csv string) error {
	body, err := c.issueGETBytes(ctx, workItemID)
	if err != nil {
		return err
	}
	var meta map[string]interface{}
	if err := json.Unmarshal(body, &meta); err != nil {
		return fmt.Errorf("yandex tracker get issue json: %w", err)
	}
	payload := map[string]interface{}{
		yandexTrackerFieldAPIAccessToTicket: strings.TrimSpace(csv),
	}
	if ver, ok := meta["version"]; ok && ver != nil {
		payload["version"] = ver
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	workItemID = strings.TrimSpace(workItemID)
	u := c.baseURL + "/v3/issues/" + url.PathEscape(workItemID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, u, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.setAuth(req); err != nil {
		return err
	}
	c.setOrgHeader(req)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	respBody, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return newYandexTrackerHTTPError(res.StatusCode, respBody)
	}
	return nil
}

func decodeYandexCommentID(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return strconv.FormatInt(n, 10)
	}
	return ""
}

// YandexTrackerIssueComment is one element from GET /v3/issues/{id}/comments (fields vary by Tracker version).
type YandexTrackerIssueComment struct {
	ID            string
	Text          string
	LongText      string
	TextHTML      string
	CreatedAtRaw  string
	CommentType   string
	TransportType string
	AuthorDisplay string
}

type ytCommentWire struct {
	IDRaw         json.RawMessage `json:"id"`
	Text          string          `json:"text"`
	LongText      string          `json:"longText"`
	TextHtml      string          `json:"textHtml"`
	CreatedAt     string          `json:"createdAt"`
	Type          string          `json:"type"`
	Transport     string          `json:"transport"`
	TransportType string          `json:"transportType"`
	CreatedBy     *struct {
		Display string `json:"display"`
	} `json:"createdBy"`
}

// ListComments returns issue comments from Tracker (newest last or as returned by API; caller may sort).
func (c *YandexTrackerClient) ListComments(ctx context.Context, workItemID string) ([]YandexTrackerIssueComment, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("yandex tracker integration is not configured")
	}
	workItemID = strings.TrimSpace(workItemID)
	if workItemID == "" {
		return nil, fmt.Errorf("yandex tracker: empty issue id or key for comments")
	}
	// expand=all returns textHtml and other fields needed for email-sourced comments (plain text may be empty).
	// Some Tracker deployments reject expand=all; fall back to the default list URL.
	pathBase := "/v3/issues/" + url.PathEscape(workItemID)
	suffixes := []string{"/comments?expand=all", "/comments"}
	var body []byte
	for i, sfx := range suffixes {
		u := c.baseURL + pathBase + sfx
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		if err := c.setAuth(req); err != nil {
			return nil, err
		}
		c.setOrgHeader(req)
		res, err := c.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
		_ = res.Body.Close()
		if res.StatusCode >= 200 && res.StatusCode < 300 {
			body = b
			break
		}
		if res.StatusCode == http.StatusBadRequest && i == 0 && len(suffixes) > 1 {
			continue
		}
		return nil, newYandexTrackerHTTPError(res.StatusCode, b)
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, nil
	}
	var rawItems []json.RawMessage
	if err := json.Unmarshal(body, &rawItems); err != nil {
		var wrap struct {
			Comments []json.RawMessage `json:"comments"`
		}
		if err2 := json.Unmarshal(body, &wrap); err2 != nil || len(wrap.Comments) == 0 {
			return nil, fmt.Errorf("yandex tracker list comments json: %w", err)
		}
		rawItems = wrap.Comments
	}
	out := make([]YandexTrackerIssueComment, 0, len(rawItems))
	for _, raw := range rawItems {
		var w ytCommentWire
		_ = json.Unmarshal(raw, &w)
		author := ""
		if w.CreatedBy != nil {
			author = strings.TrimSpace(w.CreatedBy.Display)
		}
		transport := strings.TrimSpace(w.Transport)
		if transport == "" {
			transport = strings.TrimSpace(w.TransportType)
		}
		c := YandexTrackerIssueComment{
			ID:            decodeYandexCommentID(w.IDRaw),
			Text:          w.Text,
			LongText:      w.LongText,
			TextHTML:      w.TextHtml,
			CreatedAtRaw:  w.CreatedAt,
			CommentType:   w.Type,
			TransportType: transport,
			AuthorDisplay: author,
		}
		yandexAugmentCommentFromRawJSON(raw, &c)
		out = append(out, c)
	}
	return out, nil
}

// AddComment posts a standard comment on the issue (id or key).
func (c *YandexTrackerClient) AddComment(ctx context.Context, workItemID, text string) error {
	if !c.Enabled() {
		return fmt.Errorf("yandex tracker integration is not configured")
	}
	workItemID = strings.TrimSpace(workItemID)
	if workItemID == "" {
		return fmt.Errorf("yandex tracker: empty issue id or key for comment")
	}
	u := c.baseURL + "/v3/issues/" + url.PathEscape(workItemID) + "/comments"
	payload := map[string]string{"text": text}
	buf, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.setAuth(req); err != nil {
		return err
	}
	c.setOrgHeader(req)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return newYandexTrackerHTTPError(res.StatusCode, body)
	}
	return nil
}
