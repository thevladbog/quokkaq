package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func TestIsValidPlatformInvoiceStatus(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{"draft", "draft", true},
		{"open", "open", true},
		{"paid", "paid", true},
		{"void", "void", true},
		{"uncollectible", "uncollectible", true},
		{"invalid", "sent", false},
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := isValidPlatformInvoiceStatus(tt.in); got != tt.want {
				t.Fatalf("isValidPlatformInvoiceStatus(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestResolvePlatformSubscriptionStatusForCreate(t *testing.T) {
	t.Parallel()
	invalid := "bogus"
	tests := []struct {
		name    string
		in      *string
		want    string
		wantErr bool
	}{
		{"nil means active", nil, "active", false},
		{"empty string means active", strPtr(""), "active", false},
		{"whitespace means active", strPtr("   "), "active", false},
		{"valid trimmed", strPtr("  past_due  "), "past_due", false},
		{"invalid status", &invalid, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := resolvePlatformSubscriptionStatusForCreate(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func strPtr(s string) *string { return &s }

func TestPlatformParseLimitOffset(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		query      string
		wantLimit  int
		wantOffset int
	}{
		{"defaults", "", platformDefaultLimit, 0},
		{"limit and offset", "limit=10&offset=5", 10, 5},
		{"caps limit", "limit=999", platformMaxLimit, 0},
		{"ignores bad limit", "limit=abc", platformDefaultLimit, 0},
		{"ignores negative offset", "offset=-1", platformDefaultLimit, 0},
		{"zero limit ignored", "limit=0", platformDefaultLimit, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest("GET", "/x?"+tt.query, nil)
			limit, offset := platformParseLimitOffset(req)
			if limit != tt.wantLimit || offset != tt.wantOffset {
				t.Fatalf("platformParseLimitOffset(%q) = (%d,%d), want (%d,%d)", tt.query, limit, offset, tt.wantLimit, tt.wantOffset)
			}
		})
	}
}

func TestPatchSubscriptionRequestsTierChange(t *testing.T) {
	t.Parallel()
	truePtr := true
	plan := "plan-1"
	pending := "plan-2"
	at := time.Now().UTC()
	tests := []struct {
		name string
		body PatchPlatformSubscriptionBody
		want bool
	}{
		{"empty", PatchPlatformSubscriptionBody{}, false},
		{"plan id", PatchPlatformSubscriptionBody{PlanID: &plan}, true},
		{"clear pending", PatchPlatformSubscriptionBody{ClearPending: &truePtr}, true},
		{"pending pair", PatchPlatformSubscriptionBody{PendingPlanID: &pending, PendingEffectiveAt: &at}, true},
		{"pending plan only", PatchPlatformSubscriptionBody{PendingPlanID: &pending}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := patchSubscriptionRequestsTierChange(tt.body); got != tt.want {
				t.Fatalf("patchSubscriptionRequestsTierChange() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestApplyPlatformPatchSubscriptionCore(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := time.Date(2025, 2, 1, 12, 0, 0, 0, time.UTC)
	now := time.Date(2025, 1, 10, 12, 0, 0, 0, time.UTC)
	futureTrialEnd := now.AddDate(0, 0, 7)

	t.Run("mismatched period fields", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		onlyStart := start.Add(24 * time.Hour)
		body := PatchPlatformSubscriptionBody{CurrentPeriodStart: &onlyStart}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("end before start", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		badEnd := start.Add(-time.Hour)
		body := PatchPlatformSubscriptionBody{
			CurrentPeriodStart: &start,
			CurrentPeriodEnd:   &badEnd,
		}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid status update", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		st := "paused"
		body := PatchPlatformSubscriptionBody{Status: &st}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err != nil {
			t.Fatal(err)
		}
		if sub.Status != "paused" {
			t.Fatalf("status = %q", sub.Status)
		}
	})

	t.Run("trial sets default trialEnd and aligns period end", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		st := "trial"
		body := PatchPlatformSubscriptionBody{Status: &st}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err != nil {
			t.Fatal(err)
		}
		if sub.TrialEnd == nil {
			t.Fatal("expected TrialEnd")
		}
		if !sub.CurrentPeriodEnd.Equal(*sub.TrialEnd) {
			t.Fatalf("CurrentPeriodEnd %v != TrialEnd %v", sub.CurrentPeriodEnd, *sub.TrialEnd)
		}
	})

	t.Run("cancelAtPeriodEnd invalid for canceled", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "canceled"}
		cancel := true
		body := PatchPlatformSubscriptionBody{CancelAtPeriodEnd: &cancel}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("trialEnd in past for trial", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		st := "trial"
		past := now.Add(-time.Hour)
		body := PatchPlatformSubscriptionBody{Status: &st, TrialEnd: &past}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("trial with future trialEnd ok", func(t *testing.T) {
		t.Parallel()
		sub := &models.Subscription{CurrentPeriodStart: start, CurrentPeriodEnd: end, Status: "active"}
		st := "trial"
		body := PatchPlatformSubscriptionBody{Status: &st, TrialEnd: &futureTrialEnd}
		if err := applyPlatformPatchSubscriptionCore(sub, body, now); err != nil {
			t.Fatal(err)
		}
		if !sub.TrialEnd.Equal(futureTrialEnd) {
			t.Fatalf("TrialEnd = %v, want %v", *sub.TrialEnd, futureTrialEnd)
		}
	})
}
