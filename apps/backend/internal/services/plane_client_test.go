package services

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
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

func TestPlaneClient_effectiveProjectID_doesNotCache5xxFromListProjects(t *testing.T) {
	t.Parallel()
	var n int32
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspaces/ws/projects/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method %s", r.Method)
		}
		c := atomic.AddInt32(&n, 1)
		if c == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","identifier":"PROJ"}],"next_page_results":false}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := &PlaneClient{
		baseURL:       srv.URL,
		apiKey:        "k",
		workspaceSlug: "ws",
		projectRef:    "proj",
		httpClient:    srv.Client(),
	}
	_, err := c.effectiveProjectID(context.Background())
	if err == nil {
		t.Fatal("expected error on first 503")
	}
	var pe *PlaneHTTPError
	if !errors.As(err, &pe) || pe.HTTPStatus != http.StatusServiceUnavailable {
		t.Fatalf("first err: %v", err)
	}
	id, err := c.effectiveProjectID(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("got %q", id)
	}
	if atomic.LoadInt32(&n) != 2 {
		t.Fatalf("want 2 list requests after retry, got %d", n)
	}
}

func TestPlaneClient_effectiveProjectID_caches404FromListProjects(t *testing.T) {
	t.Parallel()
	var n int32
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspaces/ws/projects/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&n, 1)
		w.WriteHeader(http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := &PlaneClient{
		baseURL:       srv.URL,
		apiKey:        "k",
		workspaceSlug: "ws",
		projectRef:    "missing",
		httpClient:    srv.Client(),
	}
	_, err := c.effectiveProjectID(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	_, err2 := c.effectiveProjectID(context.Background())
	if err2 == nil {
		t.Fatal("expected error on second call")
	}
	if atomic.LoadInt32(&n) != 1 {
		t.Fatalf("want single HTTP request (cached resolveErr), got %d", n)
	}
}

func TestPlaneClient_effectiveProjectID_paginationLimitNotCached(t *testing.T) {
	t.Parallel()
	old := planeProjectListMaxPages
	planeProjectListMaxPages = 2
	t.Cleanup(func() { planeProjectListMaxPages = old })

	var n int32
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspaces/ws/projects/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&n, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"results":[],"next_page_results":true,"next_cursor":"c2"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := &PlaneClient{
		baseURL:       srv.URL,
		apiKey:        "k",
		workspaceSlug: "ws",
		projectRef:    "never-match",
		httpClient:    srv.Client(),
	}
	_, err := c.effectiveProjectID(context.Background())
	if !errors.Is(err, ErrPlaneProjectListPaginationLimit) {
		t.Fatalf("want ErrPlaneProjectListPaginationLimit, got %v", err)
	}
	if atomic.LoadInt32(&n) != 2 {
		t.Fatalf("want 2 pages fetched, got %d", n)
	}
	// Not cached: second resolve should hit the server again.
	_, err2 := c.effectiveProjectID(context.Background())
	if !errors.Is(err2, ErrPlaneProjectListPaginationLimit) {
		t.Fatalf("second: want ErrPlaneProjectListPaginationLimit, got %v", err2)
	}
	if atomic.LoadInt32(&n) != 4 {
		t.Fatalf("want 4 total list requests (2+2), got %d", n)
	}
}
