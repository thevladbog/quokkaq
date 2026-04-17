package services

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestYandexTrackerClient_CreateWorkItem_ArrayResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/v3/issues/") {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`[{"key":"TEST-7","id":"abc","status":{"display":"Open"}}]`))
	}))
	defer srv.Close()

	t.Setenv("YANDEX_TRACKER_SA_KEY_FILE", "")
	t.Setenv("YANDEX_TRACKER_API_BASE", srv.URL)
	t.Setenv("YANDEX_TRACKER_TOKEN", "test-token")
	t.Setenv("YANDEX_TRACKER_ORG_ID", "1")
	t.Setenv("YANDEX_TRACKER_QUEUE", "TEST")
	t.Setenv("YANDEX_TRACKER_USE_CLOUD_ORG_ID", "false")

	c := NewYandexTrackerClientFromEnv()
	id, seq, st, err := c.CreateWorkItem(context.Background(), "uniq-1", "title", "body", SupportReportTicketCreateExtras{})
	if err != nil {
		t.Fatal(err)
	}
	if id != "TEST-7" || st != "Open" {
		t.Fatalf("got id=%q st=%q", id, st)
	}
	if seq == nil || *seq != 7 {
		t.Fatalf("seq: want 7, got %v", seq)
	}
}

func TestYandexTrackerClient_CreateWorkItem_ObjectResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"key":"FOO-2","id":"x","status":{"display":"In progress"}}`))
	}))
	defer srv.Close()

	t.Setenv("YANDEX_TRACKER_SA_KEY_FILE", "")
	t.Setenv("YANDEX_TRACKER_API_BASE", srv.URL)
	t.Setenv("YANDEX_TRACKER_TOKEN", "t")
	t.Setenv("YANDEX_TRACKER_ORG_ID", "1")
	t.Setenv("YANDEX_TRACKER_QUEUE", "FOO")
	t.Setenv("YANDEX_TRACKER_USE_CLOUD_ORG_ID", "false")

	c := NewYandexTrackerClientFromEnv()
	id, _, st, err := c.CreateWorkItem(context.Background(), "", "t", "d", SupportReportTicketCreateExtras{})
	if err != nil {
		t.Fatal(err)
	}
	if id != "FOO-2" || st != "In progress" {
		t.Fatalf("got id=%q st=%q", id, st)
	}
}

func TestYandexTrackerClient_CreateWorkItem_SetsAPIAccessToTheTicket(t *testing.T) {
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"key":"Z-1","id":"x","status":{"display":"Open"}}`))
	}))
	defer srv.Close()

	t.Setenv("YANDEX_TRACKER_SA_KEY_FILE", "")
	t.Setenv("YANDEX_TRACKER_API_BASE", srv.URL)
	t.Setenv("YANDEX_TRACKER_TOKEN", "t")
	t.Setenv("YANDEX_TRACKER_ORG_ID", "1")
	t.Setenv("YANDEX_TRACKER_QUEUE", "Z")
	t.Setenv("YANDEX_TRACKER_USE_CLOUD_ORG_ID", "false")

	c := NewYandexTrackerClientFromEnv()
	wantAccess := "author-uuid,admin-uuid"
	wantEmail := "author@example.com"
	wantCompany := `Acme ("ООО Ромашка")`
	_, _, _, err := c.CreateWorkItem(context.Background(), "u1", "title", "d", SupportReportTicketCreateExtras{
		ApiAccessToTicket:   wantAccess,
		ApplicantsEmail:     wantEmail,
		CompanyTrackerLabel: wantCompany,
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(gotBody, &m); err != nil {
		t.Fatalf("json: %v", err)
	}
	if g, ok := m[yandexTrackerFieldAPIAccessToTicket].(string); !ok || g != wantAccess {
		t.Fatalf("apiAccessToTheTicket: want %q, got %#v", wantAccess, m[yandexTrackerFieldAPIAccessToTicket])
	}
	if g, ok := m[yandexTrackerFieldApplicantsEmailAPI].(string); !ok || g != wantEmail {
		t.Fatalf("applicantsEmailApi: want %q, got %#v", wantEmail, m[yandexTrackerFieldApplicantsEmailAPI])
	}
	if g, ok := m[yandexTrackerFieldCompany].(string); !ok || g != wantCompany {
		t.Fatalf("company: want %q, got %#v", wantCompany, m[yandexTrackerFieldCompany])
	}
}
