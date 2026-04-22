package netutil

import (
	"net"
	"net/url"
	"os"
	"strings"
)

// WebhookTargetURLAllowed returns true when u uses https (or http to localhost in non-production)
// and the host resolves to a non-private address (SSRF guard for outgoing webhooks).
func WebhookTargetURLAllowed(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.Scheme == "" {
		return false
	}
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return false
	}
	if u.Scheme != "https" {
		if u.Scheme == "http" && (appEnv == "" || appEnv == "local" || appEnv == "development" || appEnv == "dev") {
			if host == "localhost" || host == "127.0.0.1" || host == "::1" {
				return true
			}
		}
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast()
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return false
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return false
		}
	}
	return true
}
