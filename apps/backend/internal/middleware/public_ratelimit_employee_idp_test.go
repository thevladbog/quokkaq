package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestEmployeeIdpResolveRateLimit_perUnitAndIP(t *testing.T) {
	_ = os.Setenv("EMPLOYEE_IDP_RESOLVE_RATE_INTERVAL_SEC", "1")
	_ = os.Setenv("EMPLOYEE_IDP_RESOLVE_BURST", "1")
	t.Cleanup(func() {
		_ = os.Unsetenv("EMPLOYEE_IDP_RESOLVE_RATE_INTERVAL_SEC")
		_ = os.Unsetenv("EMPLOYEE_IDP_RESOLVE_BURST")
	})

	empIdpResolveMu.Lock()
	empIdpResolveLimiters = make(map[string]*publicLimiterEntry)
	empIdpResolveMu.Unlock()

	called := 0
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		// Match production: limiter is route-scoped (chi.With) so {unitId} is on the same route.
		r.With(EmployeeIdpResolveRateLimit).Post("/{unitId}/resolve", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called++ }))
	})

	req1 := httptest.NewRequest(http.MethodPost, "/u-1/resolve", nil)
	rr1 := httptest.NewRecorder()
	r.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("1st: %d", rr1.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/u-1/resolve", nil)
	rr2 := httptest.NewRecorder()
	r.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("2nd same key: %d (want 429)", rr2.Code)
	}

	req3 := httptest.NewRequest(http.MethodPost, "/u-2/resolve", nil)
	rr3 := httptest.NewRecorder()
	r.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Fatalf("1st to other unit: %d", rr3.Code)
	}
}
