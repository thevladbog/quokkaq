package services

import "testing"

func TestTruncateSSOAuditDetail(t *testing.T) {
	t.Parallel()
	if got := truncateSSOAuditDetail("ok"); got != "ok" {
		t.Fatalf("got %q", got)
	}
	long := make([]byte, ssoAuditDetailMax+40)
	for i := range long {
		long[i] = 'x'
	}
	got := truncateSSOAuditDetail(string(long))
	if len(got) != ssoAuditDetailMax {
		t.Fatalf("len=%d", len(got))
	}
}
