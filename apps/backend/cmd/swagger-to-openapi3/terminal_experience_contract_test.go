package main

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"github.com/getkin/kin-openapi/openapi3"
	"github.com/swaggo/swag"
)

type terminalExperienceSilentSwagLogger struct{}

func (terminalExperienceSilentSwagLogger) Printf(string, ...interface{}) {}

func TestTerminalExperienceOpenAPI3Contract(t *testing.T) {
	doc := terminalExperienceOpenAPI3Document(t)

	manifest := responseJSONSchema(t, doc.Paths.Value("/terminal/experience").Get, "200")
	assertOneOfRefs(t, manifest, []string{
		"#/components/schemas/handlers.LegacyManifest",
		"#/components/schemas/handlers.ExperienceManifest",
	})
	assertDiscriminator(t, manifest, "mode", map[string]string{
		"legacy":     "#/components/schemas/handlers.LegacyManifest",
		"experience": "#/components/schemas/handlers.ExperienceManifest",
	})

	legacy := componentSchema(t, doc, "handlers.LegacyManifest")
	assertRequired(t, legacy, []string{"mode"})
	assertLiteralEnum(t, legacy.Properties["mode"].Value, "legacy")
	assertNoAdditionalProperties(t, legacy)

	experience := componentSchema(t, doc, "handlers.ExperienceManifest")
	assertRequired(t, experience, []string{"mode", "templateId", "versionId", "version", "variantId", "definition", "publishedAt"})
	assertLiteralEnum(t, experience.Properties["mode"].Value, "experience")
	assertNoAdditionalProperties(t, experience)

	ack := requestJSONSchema(t, doc.Paths.Value("/terminal/experience/ack").Post)
	assertOneOfRefs(t, ack, []string{
		"#/components/schemas/handlers.AppliedExperienceAcknowledgement",
		"#/components/schemas/handlers.RejectedExperienceAcknowledgement",
	})
	assertDiscriminator(t, ack, "status", map[string]string{
		"applied":  "#/components/schemas/handlers.AppliedExperienceAcknowledgement",
		"rejected": "#/components/schemas/handlers.RejectedExperienceAcknowledgement",
	})

	applied := componentSchema(t, doc, "handlers.AppliedExperienceAcknowledgement")
	assertRequired(t, applied, []string{"versionId", "status"})
	assertLiteralEnum(t, applied.Properties["status"].Value, "applied")
	if _, exists := applied.Properties["reasonCode"]; exists {
		t.Fatal("applied acknowledgement must not document reasonCode")
	}
	assertNoAdditionalProperties(t, applied)

	rejected := componentSchema(t, doc, "handlers.RejectedExperienceAcknowledgement")
	assertRequired(t, rejected, []string{"versionId", "status", "reasonCode"})
	assertLiteralEnum(t, rejected.Properties["status"].Value, "rejected")
	reasonCode := rejected.Properties["reasonCode"]
	if reasonCode == nil || reasonCode.Value == nil {
		t.Fatal("rejected acknowledgement reasonCode schema missing")
	}
	if reasonCode.Value.Pattern != `^[a-z0-9]+(?:[._-][a-z0-9]+)*$` {
		t.Fatalf("reasonCode pattern = %q", reasonCode.Value.Pattern)
	}
	if reasonCode.Value.MaxLength == nil || *reasonCode.Value.MaxLength != 64 {
		t.Fatalf("reasonCode maxLength = %v, want 64", reasonCode.Value.MaxLength)
	}
	assertNoAdditionalProperties(t, rejected)
}

func terminalExperienceOpenAPI3Document(t *testing.T) *openapi3.T {
	t.Helper()
	parser := swag.New(swag.SetDebugger(terminalExperienceSilentSwagLogger{}))
	if err := parser.ParseAPI("../..", "cmd/api/main.go", 100); err != nil {
		t.Fatalf("parse Swagger source: %v", err)
	}
	raw, err := json.Marshal(parser.GetSwagger())
	if err != nil {
		t.Fatal(err)
	}
	var document2 openapi2.T
	if err := json.Unmarshal(raw, &document2); err != nil {
		t.Fatal(err)
	}
	document3, err := openapi2conv.ToV3(&document2)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyTweaks(document3); err != nil {
		t.Fatalf("apply tweaks: %v", err)
	}
	return document3
}

func responseJSONSchema(t *testing.T, operation *openapi3.Operation, status string) *openapi3.Schema {
	t.Helper()
	if operation == nil || operation.Responses == nil {
		t.Fatal("operation responses missing")
	}
	response := operation.Responses.Value(status)
	if response == nil || response.Value == nil {
		t.Fatalf("response %s missing", status)
	}
	return mediaJSONSchema(t, response.Value.Content)
}

func requestJSONSchema(t *testing.T, operation *openapi3.Operation) *openapi3.Schema {
	t.Helper()
	if operation == nil || operation.RequestBody == nil || operation.RequestBody.Value == nil {
		t.Fatal("operation request body missing")
	}
	return mediaJSONSchema(t, operation.RequestBody.Value.Content)
}

func mediaJSONSchema(t *testing.T, content openapi3.Content) *openapi3.Schema {
	t.Helper()
	media := content["application/json"]
	if media == nil || media.Schema == nil || media.Schema.Value == nil {
		t.Fatal("application/json schema missing")
	}
	return media.Schema.Value
}

func componentSchema(t *testing.T, doc *openapi3.T, name string) *openapi3.Schema {
	t.Helper()
	ref := doc.Components.Schemas[name]
	if ref == nil || ref.Value == nil {
		t.Fatalf("component schema %s missing", name)
	}
	return ref.Value
}

func assertOneOfRefs(t *testing.T, schema *openapi3.Schema, want []string) {
	t.Helper()
	if len(schema.OneOf) != len(want) {
		t.Fatalf("oneOf length = %d, want %d", len(schema.OneOf), len(want))
	}
	got := make([]string, len(schema.OneOf))
	for i, ref := range schema.OneOf {
		got[i] = ref.Ref
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("oneOf refs = %v, want %v", got, want)
	}
}

func assertDiscriminator(t *testing.T, schema *openapi3.Schema, property string, mapping map[string]string) {
	t.Helper()
	if schema.Discriminator == nil || schema.Discriminator.PropertyName != property {
		t.Fatalf("discriminator = %#v, want property %q", schema.Discriminator, property)
	}
	got := make(map[string]string, len(schema.Discriminator.Mapping))
	for value, reference := range schema.Discriminator.Mapping {
		got[value] = reference.Ref
	}
	if !reflect.DeepEqual(got, mapping) {
		t.Fatalf("discriminator mapping = %#v, want %#v", got, mapping)
	}
}

func assertRequired(t *testing.T, schema *openapi3.Schema, want []string) {
	t.Helper()
	got := append([]string(nil), schema.Required...)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("required = %v, want %v", got, want)
	}
}

func assertLiteralEnum(t *testing.T, schema *openapi3.Schema, want string) {
	t.Helper()
	if schema == nil || !reflect.DeepEqual(schema.Enum, []any{want}) {
		t.Fatalf("enum = %#v, want [%q]", schema.Enum, want)
	}
}

func assertNoAdditionalProperties(t *testing.T, schema *openapi3.Schema) {
	t.Helper()
	if schema.AdditionalProperties.Has == nil || *schema.AdditionalProperties.Has {
		t.Fatalf("additionalProperties = %#v, want false", schema.AdditionalProperties)
	}
}
