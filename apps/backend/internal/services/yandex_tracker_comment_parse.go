package services

import (
	"encoding/json"
	"strings"
)

// yandexAugmentCommentFromRawJSON fills text/html/time from alternate Tracker keys (email threads, older payloads).
func yandexAugmentCommentFromRawJSON(raw []byte, c *YandexTrackerIssueComment) {
	if c == nil || len(raw) == 0 {
		return
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return
	}
	pickString := func(keys ...string) string {
		for _, key := range keys {
			v, ok := m[key]
			if !ok {
				continue
			}
			var s string
			if json.Unmarshal(v, &s) != nil {
				continue
			}
			s = strings.TrimSpace(s)
			if s != "" {
				return s
			}
		}
		return ""
	}
	if strings.TrimSpace(c.Text) == "" {
		if s := pickString("text", "plainText", "message", "snippet", "preview"); s != "" {
			c.Text = s
		}
	}
	if strings.TrimSpace(c.LongText) == "" {
		if s := pickString("longText"); s != "" {
			c.LongText = s
		}
	}
	if strings.TrimSpace(c.TextHTML) == "" {
		if s := pickString("textHtml", "textHTML", "html"); s != "" {
			c.TextHTML = s
		}
	}
	if strings.TrimSpace(c.CreatedAtRaw) == "" {
		if s := pickString("createdAt"); s != "" {
			c.CreatedAtRaw = s
		}
	}
	if strings.TrimSpace(c.CommentType) == "" {
		if s := pickString("type"); s != "" {
			c.CommentType = s
		}
	}
	if strings.TrimSpace(c.TransportType) == "" {
		if s := pickString("transport", "transportType"); s != "" {
			c.TransportType = s
		}
	}
	if em, ok := m["emailMetadata"]; ok {
		var meta struct {
			Body        string `json:"body"`
			PlainText   string `json:"plainText"`
			Plain       string `json:"plain"`
			Html        string `json:"html"`
			Text        string `json:"text"`
			Description string `json:"description"`
			Subject     string `json:"subject"`
		}
		if json.Unmarshal(em, &meta) != nil {
			return
		}
		for _, s := range []string{meta.Body, meta.PlainText, meta.Plain, meta.Text, meta.Description} {
			if ss := strings.TrimSpace(s); ss != "" {
				if strings.TrimSpace(c.Text) == "" {
					c.Text = ss
				}
				break
			}
		}
		if hs := strings.TrimSpace(meta.Html); hs != "" && strings.TrimSpace(c.TextHTML) == "" {
			c.TextHTML = hs
		}
		if strings.TrimSpace(c.Text) == "" {
			if ss := strings.TrimSpace(meta.Subject); ss != "" {
				c.Text = ss
			}
		}
	}
}
