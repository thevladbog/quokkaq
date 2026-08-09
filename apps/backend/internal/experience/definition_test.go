package experience

import (
	"encoding/json"
	"errors"
	"strconv"
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
		"flowPages": map[string]any{"serviceCatalogPageId": "start"},
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
		{name: "more than eight variants", mutate: func(v map[string]any) {
			variants := v["variants"].([]any)
			for len(variants) <= 8 {
				clone := map[string]any{
					"id": "variant-" + string(rune('a'+len(variants))),
					"profile": map[string]any{
						"id": "profile-" + string(rune('a'+len(variants))), "name": "Profile", "width": 820, "height": 1180,
						"interactionMode": "touch", "viewingDistance": "near", "safeArea": map[string]any{"top": 0, "right": 0, "bottom": 0, "left": 0},
					},
					"grid": map[string]any{"columns": 10, "rows": 10},
				}
				variants = append(variants, clone)
			}
			v["variants"] = variants
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

func TestExperienceDefinitionValidator_ValidatesCanonicalSchemaFields(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
		code   string
	}{
		{
			name: "missing required profile safe area",
			mutate: func(v map[string]any) {
				profile := v["variants"].([]any)[0].(map[string]any)["profile"].(map[string]any)
				delete(profile, "safeArea")
			},
			code: CodeSchemaInvalid,
		},
		{
			name: "invalid widget tone",
			mutate: func(v map[string]any) {
				v["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)["tone"] = "loud"
			},
			code: CodeSchemaInvalid,
		},
		{
			name: "invalid typography scale",
			mutate: func(v map[string]any) {
				v["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)["typographyScale"] = 2.01
			},
			code: CodeSchemaInvalid,
		},
		{
			name: "strict theme tokens",
			mutate: func(v map[string]any) {
				v["theme"] = map[string]any{
					"preset": "legacy-kiosk",
					"tokens": map[string]any{"header": "#ffffff", "surface": "#000000", "serviceGrid": "#123456", "unknown": "#abcdef"},
				}
			},
			code: CodeSchemaInvalid,
		},
		{
			name: "strict flow page fields",
			mutate: func(v map[string]any) {
				v["flowPages"].(map[string]any)["unknownPageId"] = "start"
			},
			code: CodeSchemaInvalid,
		},
		{
			name: "positive drawable safe area",
			mutate: func(v map[string]any) {
				profile := v["variants"].([]any)[0].(map[string]any)["profile"].(map[string]any)
				profile["safeArea"] = map[string]any{"top": 590, "right": 410, "bottom": 590, "left": 410}
			},
			code: CodeSchemaInvalid,
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

func TestExperienceDefinitionValidator_RejectsUnsafeIntegersWithoutOverflow(t *testing.T) {
	t.Run("safe area maximum int", func(t *testing.T) {
		definition := validDefinition(t, SurfaceQueueDisplay)
		profile := definition["variants"].([]any)[0].(map[string]any)["profile"].(map[string]any)
		profile["interactionMode"] = "non-touch"
		profile["safeArea"] = map[string]any{
			"top": int64(0), "right": int64(9223372036854775807), "bottom": int64(0), "left": int64(9223372036854775807),
		}
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["type"] = "clock"
		delete(definition, "flowPages")
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceQueueDisplay), CodeSchemaInvalid)
	})

	t.Run("placement maximum int", func(t *testing.T) {
		definition := validDefinition(t, SurfaceQueueDisplay)
		profile := definition["variants"].([]any)[0].(map[string]any)["profile"].(map[string]any)
		profile["interactionMode"] = "non-touch"
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["type"] = "clock"
		placement := definition["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)["placements"].(map[string]any)["catalog"].(map[string]any)
		placement["col"] = int64(9223372036854775807)
		placement["colSpan"] = int64(2)
		delete(definition, "flowPages")
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceQueueDisplay), CodeSchemaInvalid)
	})

	t.Run("unsafe service picker integer is not used", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["config"] = map[string]any{
			"presentation": map[string]any{"mode": "auto", "grid": map[string]any{"rows": 2, "columns": 2}},
			"pagination":   map[string]any{"enabled": true, "pageSize": int64(9007199254740992)},
		}
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
			t.Fatalf("opaque invalid picker config should not drive scroll validation: %v", err)
		}
	})
}

func TestRawIntMatchesJavaScriptSafeIntegerRange(t *testing.T) {
	tests := []struct {
		name  string
		raw   json.RawMessage
		valid bool
	}{
		{name: "maximum safe", raw: json.RawMessage(`9007199254740991`), valid: true},
		{name: "minimum safe", raw: json.RawMessage(`-9007199254740991`), valid: true},
		{name: "first positive unsafe", raw: json.RawMessage(`9007199254740992`)},
		{name: "first negative unsafe", raw: json.RawMessage(`-9007199254740992`)},
		{name: "maximum Go int", raw: json.RawMessage(`9223372036854775807`)},
		{name: "fraction", raw: json.RawMessage(`1.5`)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, valid := rawInt(tt.raw)
			if valid != tt.valid {
				t.Fatalf("rawInt(%s) valid = %v, want %v", tt.raw, valid, tt.valid)
			}
		})
	}
}

func TestExperienceDefinitionValidator_ValidatesCanonicalAccessConditions(t *testing.T) {
	validRules := []map[string]any{
		{"kind": "rule", "field": "identity.isAuthenticated", "operator": "is-false"},
		{"kind": "rule", "field": "identity.groups", "operator": "contains", "value": "staff"},
		{"kind": "rule", "field": "live.queueLength", "operator": "gte", "value": 4.5},
		{"kind": "rule", "field": "session.selectedServiceId", "operator": "eq", "value": "service-1"},
	}
	for index, rule := range validRules {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["access"] = map[string]any{"when": rule, "whenFalse": "lock"}
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
			t.Fatalf("valid access rule %d rejected: %v", index, err)
		}
	}

	tests := []struct {
		name   string
		access any
		page   bool
	}{
		{name: "boolean rule has value", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true", "value": true}, "whenFalse": "hide"}},
		{name: "groups rule missing value", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "identity.groups", "operator": "contains"}, "whenFalse": "hide"}},
		{name: "queue rule string value", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "live.queueLength", "operator": "gt", "value": "4"}, "whenFalse": "hide"}},
		{name: "selected service empty value", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "session.selectedServiceId", "operator": "eq", "value": ""}, "whenFalse": "hide"}},
		{name: "group empty children", access: map[string]any{"when": map[string]any{"kind": "group", "combinator": "and", "children": []any{}}, "whenFalse": "hide"}},
		{name: "unknown condition field", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "visitor.phone", "operator": "eq", "value": "secret"}, "whenFalse": "hide"}},
		{name: "strict access unknown field", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}, "whenFalse": "hide", "unknown": true}},
		{name: "page cannot lock", access: map[string]any{"when": map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}, "whenFalse": "lock"}, page: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			definition := validDefinition(t, SurfaceTicketStation)
			page := definition["pages"].([]any)[0].(map[string]any)
			if tt.page {
				page["access"] = tt.access
			} else {
				page["widgets"].([]any)[0].(map[string]any)["access"] = tt.access
			}
			requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), "condition.invalid")
		})
	}
}

func TestExperienceDefinitionValidator_ConditionNodeBoundary(t *testing.T) {
	condition := func(nodes int) any {
		var current any = map[string]any{"kind": "rule", "field": "live.isOpen", "operator": "is-true"}
		for index := 1; index < nodes; index++ {
			current = map[string]any{"kind": "group", "combinator": "and", "children": []any{current}}
		}
		return current
	}

	definition := validDefinition(t, SurfaceTicketStation)
	widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
	widget["access"] = map[string]any{"when": condition(100), "whenFalse": "hide"}
	if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
		t.Fatalf("100 condition nodes rejected: %v", err)
	}
	widget["access"] = map[string]any{"when": condition(101), "whenFalse": "hide"}
	requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
}

func TestExperienceDefinitionValidator_RequiresCanonicalFlowRoles(t *testing.T) {
	tests := []struct {
		name       string
		widgetType string
		config     map[string]any
		flowRole   string
	}{
		{name: "service picker", widgetType: "service-picker", config: map[string]any{}, flowRole: "serviceCatalogPageId"},
		{name: "ticket form", widgetType: "ticket-form", config: map[string]any{}, flowRole: "serviceFormPageId"},
		{name: "appointment ticket form", widgetType: "ticket-form", config: map[string]any{"mode": "appointment-checkin"}, flowRole: "appointmentPageId"},
		{name: "identify", widgetType: "identify", config: map[string]any{}, flowRole: "identityPageId"},
		{name: "ticket success", widgetType: "ticket-success", config: map[string]any{}, flowRole: "successPageId"},
		{name: "rich info slot", widgetType: "rich-info", config: map[string]any{"slot": "confirmation"}, flowRole: "confirmationPageId"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			definition := validDefinition(t, SurfaceTicketStation)
			widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
			widget["type"] = tt.widgetType
			widget["config"] = tt.config
			delete(definition["flowPages"].(map[string]any), tt.flowRole)
			requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeFlowRequiredPageMissing)
		})
	}
}

func TestExperienceDefinitionValidator_EnforcesTouchTargetsAndStationNoScroll(t *testing.T) {
	definition := validDefinition(t, SurfaceTicketStation)
	variant := definition["variants"].([]any)[0].(map[string]any)
	profile := variant["profile"].(map[string]any)
	profile["width"] = 550
	profile["height"] = 550
	placement := definition["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)["placements"].(map[string]any)["catalog"].(map[string]any)
	placement["colSpan"] = 1
	placement["rowSpan"] = 1
	requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), "touch.target_too_small")

	profile["width"] = 560
	profile["height"] = 560
	if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
		t.Fatalf("56px touch target rejected: %v", err)
	}

	widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
	widget["config"] = map[string]any{
		"catalog":      map[string]any{"navigation": "flat", "itemCount": 5},
		"presentation": map[string]any{"mode": "auto", "grid": map[string]any{"rows": 2, "columns": 2}},
		"pagination":   map[string]any{"enabled": false},
	}
	requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), "station.page_scroll_required")

	widget["config"] = map[string]any{
		"presentation": map[string]any{
			"mode": "manual", "grid": map[string]any{"rows": 2, "columns": 2}, "coordinateBase": "one-based",
			"placements": []any{map[string]any{"serviceId": "outside", "row": 2, "col": 2, "rowSpan": 2, "colSpan": 1}},
		},
	}
	requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), "station.page_scroll_required")
}

func TestExperienceDefinitionValidator_ResourceBoundaries(t *testing.T) {
	t.Run("actions", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		widget["actions"] = make([]any, 21)
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})

	t.Run("pages", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		definition["pages"] = make([]any, 101)
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})

	t.Run("widgets", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		definition["pages"].([]any)[0].(map[string]any)["widgets"] = make([]any, 201)
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})

	t.Run("placements", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		placements := make(map[string]any, 201)
		for index := 0; index < 201; index++ {
			placements["widget-"+string(rune(0x1000+index))] = map[string]any{"col": 1, "row": 1, "colSpan": 1, "rowSpan": 1}
		}
		definition["pages"].([]any)[0].(map[string]any)["layouts"].(map[string]any)["portrait"].(map[string]any)["placements"] = placements
		requireValidationCode(t, validationCodes(t, marshalDefinition(t, definition), SurfaceTicketStation), CodeSchemaInvalid)
	})
}

func TestExperienceDefinitionValidator_AcceptsExactResourceBoundaries(t *testing.T) {
	t.Run("twenty actions", func(t *testing.T) {
		definition := validDefinition(t, SurfaceTicketStation)
		widget := definition["pages"].([]any)[0].(map[string]any)["widgets"].([]any)[0].(map[string]any)
		actions := make([]any, 20)
		for index := range actions {
			actions[index] = map[string]any{"type": "reset-session"}
		}
		widget["actions"] = actions
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceTicketStation); err != nil {
			t.Fatalf("20 actions rejected: %v", err)
		}
	})

	t.Run("one hundred pages", func(t *testing.T) {
		definition := validDefinition(t, SurfaceQueueDisplay)
		definition["surface"] = SurfaceQueueDisplay
		delete(definition, "flowPages")
		variant := definition["variants"].([]any)[0].(map[string]any)
		variant["profile"].(map[string]any)["interactionMode"] = "non-touch"
		pages := make([]any, 100)
		for index := range pages {
			pageID := "page-" + strconv.Itoa(index)
			widgetID := "media-" + strconv.Itoa(index)
			actions := []any{}
			if index+1 < len(pages) {
				actions = []any{map[string]any{"type": "navigate", "toPageId": "page-" + strconv.Itoa(index+1)}}
			}
			pages[index] = map[string]any{
				"id": pageID, "name": pageID,
				"widgets": []any{map[string]any{"id": widgetID, "type": "media", "config": map[string]any{}, "actions": actions}},
				"layouts": map[string]any{"portrait": map[string]any{"placements": map[string]any{widgetID: map[string]any{"col": 1, "row": 1, "colSpan": 10, "rowSpan": 10}}}},
			}
		}
		definition["startPageId"] = "page-0"
		definition["pages"] = pages
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceQueueDisplay); err != nil {
			t.Fatalf("100 pages rejected: %v", err)
		}
	})

	t.Run("two hundred widgets and placements", func(t *testing.T) {
		definition := validDefinition(t, SurfaceQueueDisplay)
		definition["surface"] = SurfaceQueueDisplay
		delete(definition, "flowPages")
		variant := definition["variants"].([]any)[0].(map[string]any)
		variant["profile"].(map[string]any)["interactionMode"] = "non-touch"
		variant["grid"] = map[string]any{"columns": 48, "rows": 48}
		page := definition["pages"].([]any)[0].(map[string]any)
		widgets := make([]any, 200)
		placements := make(map[string]any, 200)
		for index := range widgets {
			widgetID := "media-" + strconv.Itoa(index)
			widgets[index] = map[string]any{"id": widgetID, "type": "media", "config": map[string]any{}, "actions": []any{}}
			placements[widgetID] = map[string]any{"col": index%48 + 1, "row": index/48 + 1, "colSpan": 1, "rowSpan": 1}
		}
		page["widgets"] = widgets
		page["layouts"] = map[string]any{"portrait": map[string]any{"placements": placements}}
		if err := ValidateDefinition(marshalDefinition(t, definition), SurfaceQueueDisplay); err != nil {
			t.Fatalf("200 widgets/placements rejected: %v", err)
		}
	})
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
