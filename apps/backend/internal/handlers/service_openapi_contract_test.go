package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestServiceListOpenAPIRequiresAuthenticationAndAuthorization(t *testing.T) {
	specBytes, err := os.ReadFile("../../docs/openapi.json")
	if err != nil {
		t.Fatalf("read OpenAPI document: %v", err)
	}

	var spec struct {
		Paths map[string]map[string]struct {
			OperationID string                     `json:"operationId"`
			Responses   map[string]json.RawMessage `json:"responses"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(specBytes, &spec); err != nil {
		t.Fatalf("decode OpenAPI document: %v", err)
	}

	expected := map[string]string{
		"/units/{unitId}/services":      "GetServicesByUnit",
		"/units/{unitId}/services-tree": "GetServicesTreeByUnit",
	}
	locationsByOperationID := make(map[string][]string, len(expected))
	for path, methods := range spec.Paths {
		for method, operation := range methods {
			for _, expectedOperationID := range expected {
				if operation.OperationID == expectedOperationID {
					location := fmt.Sprintf("%s %s", strings.ToUpper(method), path)
					locationsByOperationID[operation.OperationID] = append(locationsByOperationID[operation.OperationID], location)
				}
			}
		}
	}

	for path, expectedOperationID := range expected {
		t.Run(path, func(t *testing.T) {
			operation, ok := spec.Paths[path]["get"]
			if !ok {
				t.Fatalf("GET operation is missing from OpenAPI document")
			}
			if operation.OperationID != expectedOperationID {
				t.Errorf("GET operationId = %q, want %q", operation.OperationID, expectedOperationID)
			}

			for _, status := range []string{"401", "403"} {
				if _, ok := operation.Responses[status]; !ok {
					t.Errorf("GET operation does not document response %s", status)
				}
			}
		})

		wantLocation := "GET " + path
		locations := locationsByOperationID[expectedOperationID]
		if len(locations) != 1 || locations[0] != wantLocation {
			t.Errorf("operationId %q locations = %v, want exactly [%s]", expectedOperationID, locations, wantLocation)
		}
	}
}
