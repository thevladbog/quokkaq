package docs

import (
	"encoding/json"
	"os"
	"testing"
)

func TestServiceCreateBehaviorOpenAPIContract(t *testing.T) {
	raw, err := os.ReadFile("openapi.json")
	if err != nil {
		t.Fatal(err)
	}

	var document struct {
		Paths map[string]struct {
			Post struct {
				RequestBody struct {
					Content map[string]struct {
						Schema map[string]any `json:"schema"`
					} `json:"content"`
				} `json:"requestBody"`
			} `json:"post"`
		} `json:"paths"`
		Components struct {
			Schemas map[string]struct {
				Properties map[string]map[string]any `json:"properties"`
				Required   []string                  `json:"required"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}

	createSchema := document.Paths["/services"].Post.RequestBody.Content["application/json"].Schema
	if got, _ := createSchema["$ref"].(string); got != "#/components/schemas/handlers.ServiceCreateRequest" {
		t.Fatalf("POST /services request ref = %q, want dedicated create request", got)
	}

	createBehavior := document.Components.Schemas["handlers.ServiceCreateRequest"].Properties["behavior"]
	if nullable, _ := createBehavior["nullable"].(bool); !nullable {
		t.Fatalf("create behavior nullable = %v, want true", createBehavior["nullable"])
	}

	response := document.Components.Schemas["models.Service"]
	if nullable, _ := response.Properties["behavior"]["nullable"].(bool); nullable {
		t.Fatal("response behavior must be optional and non-nullable")
	}
	for _, required := range response.Required {
		if required == "behavior" {
			t.Fatal("response behavior must be optional")
		}
	}
}
