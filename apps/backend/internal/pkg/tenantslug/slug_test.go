package tenantslug

import "testing"

func TestNormalize(t *testing.T) {
	t.Parallel()
	if got := Normalize("  Acme Corp  "); got != "acme-corp" {
		t.Fatalf("got %q", got)
	}
	if got := Normalize("a--b"); got != "a-b" {
		t.Fatalf("got %q", got)
	}
}

func TestValidate(t *testing.T) {
	t.Parallel()
	if err := Validate("ab"); err == nil {
		t.Fatal("expected error for short slug")
	}
	if err := Validate("valid-slug"); err != nil {
		t.Fatal(err)
	}
	if err := Validate("login"); err == nil {
		t.Fatal("expected reserved error")
	}
}

func TestPickUniqueSlug(t *testing.T) {
	t.Parallel()
	s, err := PickUniqueSlug("Acme Corp", func(string) (bool, error) { return false, nil })
	if err != nil || s != "acme-corp" {
		t.Fatalf("got %q err=%v", s, err)
	}
	used := map[string]bool{"acme-corp": true}
	s2, err := PickUniqueSlug("Acme Corp", func(slug string) (bool, error) {
		return used[slug], nil
	})
	if err != nil || s2 != "acme-corp-1" {
		t.Fatalf("got %q err=%v", s2, err)
	}
}
