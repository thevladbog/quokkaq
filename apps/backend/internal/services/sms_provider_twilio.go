package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// TwilioSMSProvider sends SMS via the Twilio Messages API.
// Used as an international fallback for non-RU deployments.
// Docs: https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource
type TwilioSMSProvider struct {
	accountSID string
	authToken  string
	from       string // E.164 phone number or alphanumeric sender ID
}

func NewTwilioSMSProvider(accountSID, authToken, from string) *TwilioSMSProvider {
	return &TwilioSMSProvider{accountSID: accountSID, authToken: authToken, from: from}
}

func (p *TwilioSMSProvider) Name() string { return "twilio" }

func (p *TwilioSMSProvider) Send(to, body string) error {
	apiURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", p.accountSID)

	params := url.Values{}
	params.Set("To", to)
	params.Set("From", p.from)
	params.Set("Body", body)

	req, err := http.NewRequest(http.MethodPost, apiURL, strings.NewReader(params.Encode()))
	if err != nil {
		return fmt.Errorf("twilio: build request: %w", err)
	}
	req.SetBasicAuth(p.accountSID, p.authToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("twilio: request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp struct {
			Message string `json:"message"`
			Code    int    `json:"code"`
		}
		_ = json.Unmarshal(respBody, &errResp)
		return fmt.Errorf("twilio: HTTP %d: %s (code %d)", resp.StatusCode, errResp.Message, errResp.Code)
	}
	return nil
}
