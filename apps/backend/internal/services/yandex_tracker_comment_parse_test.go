package services

import "testing"

func TestYandexAugmentCommentFromRawJSON_emailMetadata(t *testing.T) {
	raw := []byte(`{"id":1,"type":"incoming","transport":"email","createdAt":"2020-01-02T03:04:05.000+0000","emailMetadata":{"plainText":"hello from mail","html":"<p>x</p>"}}`)
	var c YandexTrackerIssueComment
	yandexAugmentCommentFromRawJSON(raw, &c)
	if c.Text != "hello from mail" {
		t.Fatalf("text: got %q", c.Text)
	}
	if c.TextHTML != "<p>x</p>" {
		t.Fatalf("textHtml: got %q", c.TextHTML)
	}
	if c.CreatedAtRaw == "" {
		t.Fatal("expected createdAt")
	}
}
