package handlers

import (
	"encoding/json"
	"os"
	"testing"
)

func TestServiceListOpenAPIRequiresAuthenticationAndAuthorization(t *testing.T) {
	specBytes, err := os.ReadFile("../../docs/openapi.json")
	if err != nil {
		t.Fatalf("read OpenAPI document: %v", err)
	}

	var spec struct {
		Paths map[string]map[string]struct {
			Responses map[string]json.RawMessage `json:"responses"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(specBytes, &spec); err != nil {
		t.Fatalf("decode OpenAPI document: %v", err)
	}

	for _, path := range []string{
		"/units/{unitId}/services",
		"/units/{unitId}/services-tree",
	} {
		t.Run(path, func(t *testing.T) {
			operation, ok := spec.Paths[path]["get"]
			if !ok {
				t.Fatalf("GET operation is missing from OpenAPI document")
			}

			for _, status := range []string{"401", "403"} {
				if _, ok := operation.Responses[status]; !ok {
					t.Errorf("GET operation does not document response %s", status)
				}
			}
		})
	}
}
