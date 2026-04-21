package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// SMSAeroProvider sends SMS via SMSAero.ru JSON API v2.
// Docs: https://smsaero.ru/api/v2/
type SMSAeroProvider struct {
	email    string
	apiKey   string
	signName string
}

func NewSMSAeroProvider(email, apiKey, signName string) *SMSAeroProvider {
	return &SMSAeroProvider{email: email, apiKey: apiKey, signName: signName}
}

func (p *SMSAeroProvider) Name() string { return "smsaero" }

func (p *SMSAeroProvider) Send(to, body string) error {
	// SMSAero uses HTTP Basic auth with email:apikey.
	apiURL := "https://gate.smsaero.ru/v2/sms/send"
	params := url.Values{}
	params.Set("number", to)
	params.Set("text", body)
	if p.signName != "" {
		params.Set("sign", p.signName)
	} else {
		params.Set("sign", "SMS Aero") // default test sender
	}

	req, err := http.NewRequest(http.MethodGet, apiURL+"?"+params.Encode(), nil)
	if err != nil {
		return fmt.Errorf("smsaero: build request: %w", err)
	}
	req.SetBasicAuth(p.email, p.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("smsaero: request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("smsaero: invalid response: %w (body: %s)", err, strings.TrimSpace(string(respBody)))
	}
	if !result.Success {
		return fmt.Errorf("smsaero: API error: %s", result.Message)
	}
	return nil
}
