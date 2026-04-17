package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPlaneClient_effectiveProjectID_resolvesIdentifier(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspaces/acme/projects/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[{"id":"11111111-1111-1111-1111-111111111111","identifier":"SUPPORT"}],"next_page_results":false}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := &PlaneClient{
		baseURL:       srv.URL,
		apiKey:        "k",
		workspaceSlug: "acme",
		projectRef:    "support",
		httpClient:    srv.Client(),
	}
	id, err := c.effectiveProjectID(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("got id %q", id)
	}
	id2, err := c.effectiveProjectID(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id2 != id {
		t.Fatalf("second call: got %q want %q", id2, id)
	}
}

func TestPlaneClient_effectiveProjectID_prefersExplicitUUID(t *testing.T) {
	t.Parallel()
	c := &PlaneClient{
		baseURL:       "http://unused",
		apiKey:        "k",
		workspaceSlug: "ws",
		projectID:     "22222222-2222-2222-2222-222222222222",
		projectRef:    "SHOULD-NOT-MATTER",
		httpClient:    http.DefaultClient,
	}
	id, err := c.effectiveProjectID(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id != "22222222-2222-2222-2222-222222222222" {
		t.Fatalf("got %q", id)
	}
}
