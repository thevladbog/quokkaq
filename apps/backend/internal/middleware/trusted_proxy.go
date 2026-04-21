package middleware

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
)

var (
	trustedProxyMu     sync.RWMutex
	trustedProxyNets   []*net.IPNet
	trustedProxyParsed bool
)

func parseTrustedProxyCIDRs() {
	trustedProxyMu.Lock()
	defer trustedProxyMu.Unlock()
	if trustedProxyParsed {
		return
	}
	trustedProxyParsed = true
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDRS"))
	if raw == "" {
		trustedProxyNets = nil
		return
	}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, n, err := net.ParseCIDR(part); err == nil {
			trustedProxyNets = append(trustedProxyNets, n)
			continue
		}
		if ip := net.ParseIP(part); ip != nil {
			var cidr string
			if ip.To4() != nil {
				cidr = ip.String() + "/32"
			} else {
				cidr = ip.String() + "/128"
			}
			if _, n, err := net.ParseCIDR(cidr); err == nil {
				trustedProxyNets = append(trustedProxyNets, n)
			}
		}
	}
}

// remoteAddrIsTrustedProxy returns true when r.RemoteAddr is inside TRUSTED_PROXY_CIDRS.
// When unset, returns false (X-Forwarded-For must not be trusted).
func remoteAddrIsTrustedProxy(r *http.Request) bool {
	parseTrustedProxyCIDRs()
	trustedProxyMu.RLock()
	defer trustedProxyMu.RUnlock()
	if len(trustedProxyNets) == 0 {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, n := range trustedProxyNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
