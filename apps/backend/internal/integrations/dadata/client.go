package dadata

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	suggestionsBaseURL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs"
	cleanerBaseURL     = "https://cleaner.dadata.ru/api/v1"
)

// cleanerHTTPClient is shared for Cleaner API calls so connections are pooled (http.Client is safe for concurrent use).
var cleanerHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
}

// Client calls DaData Suggestions and Cleaner APIs (keys stay on the server).
type Client struct {
	httpClient *http.Client
	apiKey     string
	secret     string
}

// NewClientFromEnv builds a client from DADATA_API_KEY and optional DADATA_SECRET.
func NewClientFromEnv() (*Client, error) {
	key := strings.TrimSpace(os.Getenv("DADATA_API_KEY"))
	if key == "" {
		return nil, fmt.Errorf("DADATA_API_KEY is not set")
	}
	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		apiKey:     key,
		secret:     strings.TrimSpace(os.Getenv("DADATA_SECRET")),
	}, nil
}

// CleanerAPIKey returns DADATA_CLEANER_API_KEY for POST /clean/ADDRESS. Empty if unset (main suggestions key is not accepted as a fallback).
func CleanerAPIKey() string {
	return strings.TrimSpace(os.Getenv("DADATA_CLEANER_API_KEY"))
}

func (c *Client) postJSON(url string, body []byte, authToken string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Token "+authToken)
	if c.secret != "" {
		req.Header.Set("X-Secret", c.secret)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return b, resp.StatusCode, nil
}

// FindPartyByID proxies findById/party (body is DaData JSON, usually {"query":"<inn>",...}).
func (c *Client) FindPartyByID(body []byte) ([]byte, int, error) {
	url := suggestionsBaseURL + "/findById/party"
	return c.postJSON(url, body, c.apiKey)
}

// SuggestParty proxies suggest/party.
func (c *Client) SuggestParty(body []byte) ([]byte, int, error) {
	url := suggestionsBaseURL + "/suggest/party"
	return c.postJSON(url, body, c.apiKey)
}

// SuggestAddress proxies suggest/address.
func (c *Client) SuggestAddress(body []byte) ([]byte, int, error) {
	url := suggestionsBaseURL + "/suggest/address"
	return c.postJSON(url, body, c.apiKey)
}

// CleanAddress calls POST /clean/ADDRESS with an array of strings (Cleaner API).
func CleanAddress(body []byte) ([]byte, int, error) {
	token := CleanerAPIKey()
	if token == "" {
		return nil, 0, fmt.Errorf("no API key for Cleaner")
	}
	url := cleanerBaseURL + "/clean/ADDRESS"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Token "+token)
	if s := strings.TrimSpace(os.Getenv("DADATA_SECRET")); s != "" {
		req.Header.Set("X-Secret", s)
	}
	resp, err := cleanerHTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return b, resp.StatusCode, nil
}
