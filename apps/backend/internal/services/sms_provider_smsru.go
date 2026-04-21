package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SMSRuProvider sends SMS via SMS.ru JSON API v2.
// Docs: https://sms.ru/api/send
type SMSRuProvider struct {
	apiID      string
	from       string
	httpClient *http.Client
}

func NewSMSRuProvider(apiID, from string) *SMSRuProvider {
	return &SMSRuProvider{
		apiID:      apiID,
		from:       from,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *SMSRuProvider) Name() string { return "smsru" }

func (p *SMSRuProvider) Send(to, body string) error {
	params := url.Values{}
	params.Set("api_id", p.apiID)
	params.Set("to", to)
	params.Set("msg", body)
	params.Set("json", "1")
	if p.from != "" {
		params.Set("from", p.from)
	}

	req, err := http.NewRequest(http.MethodPost, "https://sms.ru/sms/send", strings.NewReader(params.Encode()))
	if err != nil {
		return fmt.Errorf("smsru: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("smsru: request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		StatusCode int    `json:"status_code"`
		StatusText string `json:"status_text"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("smsru: invalid response: %w", err)
	}
	if result.StatusCode != 100 {
		return fmt.Errorf("smsru: API error %d: %s", result.StatusCode, result.StatusText)
	}
	return nil
}
