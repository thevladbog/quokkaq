// Command swagger-to-openapi3 converts swag-generated Swagger 2.0 docs/swagger.json
// to OpenAPI 3.x, applies structural patches (see tweaks.go), and writes JSON + YAML output
// plus docs/docs.go.
//
// Run from apps/backend after: swag init -g cmd/api/main.go -o ./docs
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"gopkg.in/yaml.v3"
)

// enumSingleTrueLine compacts `"enum": [\n    true\n]` → `"enum": [true]` for
// stable git diffs (json.MarshalIndent always expands single-element arrays).
var enumSingleTrueLine = regexp.MustCompile(`"enum":\s*\[\s+true\s+\]`)

// htmlUnescaper reverses Go's default HTML-safe JSON encoding for the three
// characters that are safe in JSON string values but not in HTML (<, >, &).
// kin-openapi's custom MarshalJSON methods call json.Marshal internally with
// escapeHTML=true, so some descriptions still contain escape sequences even
// when the outer encoder has SetEscapeHTML(false). Unescaping here keeps the
// committed OpenAPI artifacts human-readable.
var htmlUnescaper = strings.NewReplacer(
	`\u003c`, "<",
	`\u003e`, ">",
	`\u0026`, "&",
)

func writeJSON(path string, v any) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "    ")
	if err := enc.Encode(v); err != nil {
		return fmt.Errorf("marshal json: %w", err)
	}
	// enc.Encode already appends a trailing newline.
	text := buf.String()
	text = htmlUnescaper.Replace(text)
	text = enumSingleTrueLine.ReplaceAllLiteralString(text, `"enum": [true]`)
	return os.WriteFile(path, []byte(text), 0o644)
}

func writeYAML(path string, v any) error {
	out, err := yaml.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal yaml: %w", err)
	}
	return os.WriteFile(path, out, 0o644)
}

func main() {
	docsDir := "docs"
	if len(os.Args) > 1 {
		docsDir = os.Args[1]
	}

	// Step 1: read Swagger 2.0 produced by swag init.
	swaggerPath := filepath.Join(docsDir, "swagger.json")
	raw, err := os.ReadFile(swaggerPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", swaggerPath, err)
		os.Exit(1)
	}

	// Step 2: parse and convert to OpenAPI 3.
	var doc2 openapi2.T
	if err := json.Unmarshal(raw, &doc2); err != nil {
		fmt.Fprintf(os.Stderr, "parse swagger 2.0: %v\n", err)
		os.Exit(1)
	}
	if doc2.Swagger != "2.0" {
		fmt.Fprintf(os.Stderr, "%s: expected Swagger 2.0 (\"swagger\": \"2.0\") but got %q — run swag init first\n", swaggerPath, doc2.Swagger)
		os.Exit(1)
	}
	doc3, err := openapi2conv.ToV3(&doc2)
	if err != nil {
		fmt.Fprintf(os.Stderr, "convert to OpenAPI 3: %v\n", err)
		os.Exit(1)
	}

	// Step 3: apply structural patches (see tweaks.go).
	if err := applyTweaks(doc3); err != nil {
		fmt.Fprintf(os.Stderr, "applyTweaks: %v\n", err)
		os.Exit(1)
	}

	// Step 4: write output files.
	//
	// openapi.json — canonical OpenAPI 3 spec (Orval, Scalar, and docs.go embed read this).
	// swagger.json — backward-compatible alias (same content; swag also uses this name as intermediate).
	// swagger.yaml — YAML mirror.
	// docs.go      — Go embed wrapper.

	if err := writeJSON(swaggerPath, doc3); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", swaggerPath, err)
		os.Exit(1)
	}
	openAPIPath := filepath.Join(docsDir, "openapi.json")
	if err := writeJSON(openAPIPath, doc3); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", openAPIPath, err)
		os.Exit(1)
	}
	yamlPath := filepath.Join(docsDir, "swagger.yaml")
	if err := writeYAML(yamlPath, doc3); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", yamlPath, err)
		os.Exit(1)
	}

	docsGo := filepath.Join(docsDir, "docs.go")
	const docsGoContent = `// Package docs embeds the OpenAPI 3 API specification generated from Swagger 2.0 (swag) via kin-openapi.
// Run from apps/backend: go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3
// Or via Nx from repo root: pnpm nx run backend:openapi
package docs

import _ "embed"

//go:embed openapi.json
var OpenAPIJSON []byte
`
	if err := os.WriteFile(docsGo, []byte(docsGoContent), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", docsGo, err)
		os.Exit(1)
	}
}
