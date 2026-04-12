package handlers

import "strings"

// normalizeCallNextServiceFilter resolves service filter for call-next APIs.
// Non-empty serviceIDs (after trim/dedupe) wins; otherwise legacy single serviceId; otherwise nil (entire unit queue).
func normalizeCallNextServiceFilter(serviceIDs []string, legacyServiceID *string) []string {
	deduped := dedupeNonEmptyServiceIDs(serviceIDs)
	if len(deduped) > 0 {
		return deduped
	}
	if legacyServiceID != nil {
		if s := strings.TrimSpace(*legacyServiceID); s != "" {
			return []string{s}
		}
	}
	return nil
}

func dedupeNonEmptyServiceIDs(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
