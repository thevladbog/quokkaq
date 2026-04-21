package services

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// SMSCProvider sends SMS via SMSC.ru HTTP API.
// Docs: https://smsc.ru/api/http/
type SMSCProvider struct {
	login    string
	password string
	sender   string
}

func NewSMSCProvider(login, password, sender string) *SMSCProvider {
	return &SMSCProvider{login: login, password: password, sender: sender}
}

func (p *SMSCProvider) Name() string { return "smsc" }

func (p *SMSCProvider) Send(to, body string) error {
	params := url.Values{}
	params.Set("login", p.login)
	params.Set("psw", p.password)
	params.Set("phones", to)
	params.Set("mes", body)
	params.Set("charset", "utf-8")
	params.Set("fmt", "1") // plain text response
	if p.sender != "" {
		params.Set("sender", p.sender)
	}

	resp, err := http.PostForm("https://smsc.ru/sys/send.php", params)
	if err != nil {
		return fmt.Errorf("smsc: request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, _ := io.ReadAll(resp.Body)
	text := strings.TrimSpace(string(respBody))
	// SMSC returns "ERROR=N" on failure.
	if strings.HasPrefix(text, "ERROR") {
		return fmt.Errorf("smsc: API error: %s", text)
	}
	return nil
}
