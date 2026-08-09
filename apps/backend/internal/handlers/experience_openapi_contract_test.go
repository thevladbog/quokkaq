package handlers

import (
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/swaggo/swag"
)

type silentSwagLogger struct{}

func (silentSwagLogger) Printf(string, ...interface{}) {}

func TestExperienceOpenAPISourceAnnotationsAreGeneratable(t *testing.T) {
	parser := swag.New(swag.SetDebugger(silentSwagLogger{}))
	if err := parser.ParseAPI("../..", "cmd/api/main.go", 100); err != nil {
		t.Fatalf("parse Swagger source: %v", err)
	}
	document := parser.GetSwagger()
	tests := []struct {
		path     string
		method   string
		statuses []int
	}{
		{path: "/companies/me/screen-layout-templates/{templateId}/publish", method: "post", statuses: []int{201, 400, 401, 403, 404, 409, 500}},
		{path: "/companies/me/screen-layout-templates/{templateId}/versions", method: "get", statuses: []int{200, 400, 401, 403, 404, 500}},
		{path: "/companies/me/screen-layout-templates/{templateId}/versions/{versionId}/restore", method: "post", statuses: []int{201, 400, 401, 403, 404, 409, 500}},
		{path: "/companies/me/screen-layout-templates/{templateId}", method: "delete", statuses: []int{204, 401, 403, 404, 409, 500}},
		{path: "/desktop-terminals/{id}", method: "patch", statuses: []int{204, 400, 401, 403, 404, 409, 500}},
	}
	for _, testCase := range tests {
		pathItem, ok := document.Paths.Paths[testCase.path]
		if !ok {
			t.Errorf("missing generated path %s", testCase.path)
			continue
		}
		operation := pathItem.Get
		if testCase.method == "post" {
			operation = pathItem.Post
		}
		if testCase.method == "delete" {
			operation = pathItem.Delete
		}
		if testCase.method == "patch" {
			operation = pathItem.Patch
		}
		if operation == nil {
			t.Errorf("missing generated %s operation for %s", testCase.method, testCase.path)
			continue
		}
		if strings.TrimSpace(operation.Summary) == "" || len(operation.Tags) == 0 {
			t.Errorf("operation %s %s lacks summary/tags", testCase.method, testCase.path)
		}
		for _, status := range testCase.statuses {
			if _, ok := operation.Responses.StatusCodeResponses[status]; !ok {
				t.Errorf("operation %s %s lacks response %d", testCase.method, testCase.path, status)
			}
		}
	}

	updatePath := document.Paths.Paths["/desktop-terminals/{id}"].Patch
	var requestRef string
	for _, parameter := range updatePath.Parameters {
		if parameter.In == "body" && parameter.Schema != nil {
			requestRef = parameter.Schema.Ref.String()
		}
	}
	if requestRef != "#/definitions/handlers.UpdateDesktopTerminalRequestDoc" {
		t.Fatalf("terminal update request ref = %q", requestRef)
	}
	for _, schemaName := range []string{"handlers.UpdateDesktopTerminalRequestDoc", "handlers.DesktopTerminalResponseDoc"} {
		schema, ok := document.Definitions[schemaName]
		if !ok {
			t.Fatalf("missing generated schema %s", schemaName)
		}
		for _, propertyName := range []string{"experienceTemplateId", "experienceVariantId"} {
			property, ok := schema.Properties[propertyName]
			if !ok {
				t.Fatalf("%s missing property %s", schemaName, propertyName)
			}
			if nullable, _ := property.Extensions["x-nullable"].(bool); !nullable {
				t.Errorf("%s.%s x-nullable = %v", schemaName, propertyName, property.Extensions["x-nullable"])
			}
			for _, required := range schema.Required {
				if required == propertyName {
					t.Errorf("%s.%s unexpectedly required", schemaName, propertyName)
				}
			}
		}
	}
	for _, schemaName := range []string{"models.ExperienceTemplateVersion", "models.ExperienceTemplateVersionMetadata"} {
		schema, ok := document.Definitions[schemaName]
		if !ok {
			t.Fatalf("missing generated schema %s", schemaName)
		}
		publisher, ok := schema.Properties["publishedBy"]
		if !ok {
			t.Fatalf("%s missing property publishedBy", schemaName)
		}
		if nullable, _ := publisher.Extensions["x-nullable"].(bool); !nullable {
			t.Errorf("%s.publishedBy x-nullable = %v", schemaName, publisher.Extensions["x-nullable"])
		}
	}
}

func TestTerminalAssignmentOpenAPIDTOsAreOptionalNullableAndServerControlled(t *testing.T) {
	requestType := reflect.TypeOf(UpdateDesktopTerminalRequestDoc{})
	responseType := reflect.TypeOf(DesktopTerminalResponseDoc{})
	for _, fieldName := range []string{"ExperienceTemplateID", "ExperienceVariantID"} {
		for _, docType := range []reflect.Type{requestType, responseType} {
			field, ok := docType.FieldByName(fieldName)
			if !ok {
				t.Fatalf("%s missing %s", docType.Name(), fieldName)
			}
			if field.Type.Kind() != reflect.Pointer || !strings.Contains(field.Tag.Get("json"), "omitempty") || field.Tag.Get("extensions") != "x-nullable" {
				t.Errorf("%s.%s tags/type = %s %q %q, want optional nullable pointer", docType.Name(), fieldName, field.Type, field.Tag.Get("json"), field.Tag.Get("extensions"))
			}
		}
	}
	for _, serverField := range []string{"AppliedTemplateVersionID", "AppliedTemplateAt", "ExperienceAckStatus", "ExperienceAckReasonCode", "ExperienceAckAt"} {
		if _, exists := requestType.FieldByName(serverField); exists {
			t.Errorf("assignment request exposes server-controlled field %s", serverField)
		}
	}

	source, err := os.ReadFile("desktop_terminal_handler.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), "@Param        body  body      UpdateDesktopTerminalRequestDoc") {
		t.Fatal("terminal update annotation does not use explicit nullable request doc DTO")
	}
}
