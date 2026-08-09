package experience

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func validDefinition(t *testing.T, surface string) map[string]any {
	t.Helper()
	return map[string]any{
		"schemaVersion": 1,
		"id":            "experience-1",
		"surface":       surface,
		"startPageId":   "start",
		"variants": []any{
			map[string]any{
				"id": "portrait",
				"profile": map[string]any{
					"id":              "ipad-portrait",
					"name":            "iPad portrait",
					"width":           820,
					"height":          1180,
					"interactionMode": "touch",
					"viewingDistance": "near",
					"safeArea": map[string]any{
						"top": 0, "right": 0, "bottom": 0, "left": 0,
					},
				},
				"grid": map[string]any{"columns": 10, "rows": 10},
			},
		},
		"pages": []any{
			map[string]any{
				"id":   "start",
				"name": "Start",
				"widgets": []any{
					map[string]any{
						"id":      "catalog",
						"type":    "service-picker",
						"config":  map[string]any{},
						"actions": []any{},
					},
				},
				"layouts": map[string]any{
					"portrait": map[string]any{
						"placements": map[string]any{
							"catalog": map[string]any{
								"col": 1, "row": 1, "colSpan": 10, "rowSpan": 10,
							},
						},
					},
				},
			},
		},
	}
}

func marshalDefinition(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func validationCodes(t *testing.T, raw json.RawMessage, surface string) []string {
	t.Helper()
	err := ValidateDefinition(raw, surface)
	if err == nil {
		return nil
	}
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("ValidateDefinition error = %T %v, want *ValidationError", err, err)
	}
	codes := make([]string, 0, len(validationErr.Issues))
	for _, issue := range validationErr.Issues {
		codes = append(codes, issue.Code)
	}
	return codes
}

func requireValidationCode(t *testing.T, codes []string, want string) {
	t.Helper()
	for _, code := range codes {
		if code == want {
			return
		}
	}
	t.Fatalf("codes = %v, want %q", codes, want)
}

func TestExperienceDefinitionValidator_AcceptsBoundedEnvelope(t *testing.T) {
	raw := marshalDefinition(t, validDefinition(t, SurfaceTicketStation))
	if err := ValidateDefinition(raw, SurfaceTicketStation); err != nil {
		t.Fatalf("ValidateDefinition() error = %v", err)
	}
	matched, err := HasVariant(raw, "portrait")
	if err != nil || !matched {
		t.Fatalf("HasVariant(portrait) = %v, %v", matched, err)
	}
}

func TestExperienceDefinitionValidator_RejectsEnvelopeViolations(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(map[string]any)
		raw     json.RawMessage
		surface string
		code    string
	}{
		{name: "non object", raw: json.RawMessage(`[]`), surface: SurfaceTicketStation, code: CodeSchemaInvalid},
		{name: "wrong schema version", mutate: func(v map[string]any) { v["schemaVersion"] = 2 }, code: CodeSchemaInvalid},
		{name: "unknown surface", mutate: func(v map[string]any) { v["surface"] = "tablet" }, code: CodeSchemaInvalid},
		{name: "surface mismatch", surface: SurfaceQueueDisplay, code: CodeSchemaInvalid},
		{name: "zero variants", mutate: func(v map[string]any) { v["variants"] = []any{} }, code: CodeSchemaInvalid},
		{name: "more than two variants", mutate: func(v map[string]any) {
			variants := v["variants"].([]any)
			v["variants"] = append(variants, variants[0], variants[0])
		}, code: CodeSchemaInvalid},
		{name: "empty pages", mutate: func(v map[string]any) { v["pages"] = []any{} }, code: CodeSchemaInvalid},
		{name: "missing start page", mutate: func(v map[string]any) { v["startPageId"] = "missing" }, code: CodePageStartMissing},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			surface := tt.surface
			if surface == "" {
				surface = SurfaceTicketStation
			}
			raw := tt.raw
			if raw == nil {
				definition := validDefinition(t, SurfaceTicketStation)
				if tt.mutate != nil {
					tt.mutate(definition)
				}
				raw = marshalDefinition(t, definition)
			}
			requireValidationCode(t, validationCodes(t, raw, surface), tt.code)
		})
	}
}

func TestExperienceDefinitionValidator_RejectsDuplicateIDs(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "variant",
			mutate: func(v map[string]any) {
				variants := v["variants"].([]any)
				v["variants"] = append(variants, variants[0])
			},
		},
		{
			name: "page",
			mutate: func(v map[string]any) {
				pages := v["pages"].([]any)
				v["pages"] = append(pages, pages[0])
			},
		},
		{
			name: "widget",
			mutate: func(v map[string]any) {
				page := v["pages"].([]any)[0].(map[string]any)
				widgets := page["widgets"].([]any)
				page["widgets"] = append(widgets, widgets[0])
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			definition := validDefinition(t, SurfaceTicketStation)
			tt.mutate(definition)
			requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
		})
	}
}

func TestExperienceDefinitionValidator_ValidatesActionsAndGraph(t *testing.T) {
	t.Run("missing navigate target", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["actions"] = []any{map[string]any{"type": "navigate", "toPageId": "missing"}}
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeActionTargetMissing)
	})

	t.Run("unknown action", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["actions"] = []any{map[string]any{"type": "execute-code"}}
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})

	t.Run("unreachable page", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		page := definition["pages"].([]any)[0].(map[string]any)
		orphan := map[string]any{
			"id": "orphan", "name": "Orphan", "widgets": []any{},
			"layouts": map[string]any{"portrait": map[string]any{"placements": map[string]any{}}},
		}
		definition["pages"] = append(definition["pages"].([]any), orphan)
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodePageUnreachable)

		widget := page["widgets"].([]any)[0].(map[string]any)
		widget["actions"] = []any{map[string]any{"type": "navigate", "toPageId": "orphan"}}
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
			t.Fatalf("reachable definition rejected: %v", err)
		}
	})

	t.Run("legacy service routes are semantic graph edges", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		start := definition["pages"].([]any)[0].(map[string]any)
		picker := start["widgets"].([]any)[0].(map[string]any)
		picker["config"] = map[string]any{
			"legacyRouting": map[string]any{
				"source":         "legacy-service-routes",
				"canonicalSlots": []any{"service-info", "service-form", "identity", "confirmation", "success"},
				"routes": []any{
					map[string]any{
						"serviceId":          "service-1",
						"identificationMode": "qr",
						"slots":              []any{"identity", "success"},
						"terminalActions":    []any{map[string]any{"type": "redeem-pre-registration"}},
					},
				},
			},
		}
		for _, pageID := range []string{"identity", "success"} {
			definition["pages"] = append(definition["pages"].([]any), map[string]any{
				"id": pageID, "name": pageID, "widgets": []any{},
				"layouts": map[string]any{"portrait": map[string]any{"placements": map[string]any{}}},
			})
		}
		definition["flowPages"] = map[string]any{
			"serviceCatalogPageId": "start",
			"identityPageId":       "identity",
			"successPageId":        "success",
		}

		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
			t.Fatalf("legacy route definition rejected: %v", err)
		}

		routing := picker["config"].(map[string]any)["legacyRouting"].(map[string]any)
		route := routing["routes"].([]any)[0].(map[string]any)
		route["terminalActions"] = []any{map[string]any{"type": "submit-ticket"}}
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})
}

func TestExperienceDefinitionValidator_ValidatesPlacements(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
		code   string
	}{
		{
			name: "missing layout",
			mutate: func(v map[string]any) {
				v["pages"].([]any)[0].(map[string]any)["layouts"] = map[string]any{}
			},
			code: CodeVariantUnplacedWidget,
		},
		{
			name: "missing placement",
			mutate: func(v map[string]any) {
				layout := v["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)
				layout["placements"] = map[string]any{}
			},
			code: CodeVariantUnplacedWidget,
		},
		{
			name: "overflow",
			mutate: func(v map[string]any) {
				placement := v["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)["placements"].(map[string]any)["catalog"].(map[string]any)
				placement["col"] = 2
			},
			code: CodeVariantPlacementOverflow,
		},
		{
			name: "overlap",
			mutate: func(v map[string]any) {
				page := v["pages"].([]any)[0].(map[string]any)
				page["widgets"] = append(page["widgets"].([]any), map[string]any{
					"id": "next", "type": "media", "config": map[string]any{}, "actions": []any{},
				})
				placements := page["layouts"].(map[string]any)["portrait"].(map[string]any)["placements"].(map[string]any)
				placements["next"] = map[string]any{"col": 1, "row": 1, "colSpan": 1, "rowSpan": 1}
			},
			code: CodeVariantPlacementOverlap,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			definition := validDefinition(t, SurfaceTicketStation)
			tt.mutate(definition)
			requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), tt.code)
		})
	}
}

func TestExperienceDefinitionValidator_EnforcesSurfaceWidgetPolicy(t *testing.T) {
	definition := validDefinition(t, SurfaceTicketStation)
	widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
	widget["type"] = "custom-html"
	requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeWidgetUnsupportedForSurface)
}

func TestExperienceDefinitionValidator_FailsClosedWithoutLeakingDefinition(t *testing.T) {
	secret := "visitor-phone-should-never-appear"
	huge := json.RawMessage(`{"schemaVersion":1,"config":"` + strings.Repeat("x", MaxDefinitionBytes) + secret + `"}`)
	err := ValidateDefinition(huge, SurfaceTicketStation)
	if err == nil {
		t.Fatal("huge definition unexpectedly accepted")
	}
	if strings.Contains(err.Error(), secret) {
		t.Fatalf("validation error leaked definition content: %v", err)
	}
	if got := len(validationCodes(t, huge, SurfaceTicketStation)); got == 0 {
		t.Fatal("huge definition returned no stable issue code")
	}

	malformed := json.RawMessage(`{"schemaVersion":1,"surface":"ticket-station","pages":[`)
	if err := ValidateDefinition(malformed, SurfaceTicketStation); err == nil {
		t.Fatal("malformed definition unexpectedly accepted")
	}
}
