// Command swagger-to-openapi3 converts swag-generated Swagger 2.0 docs/swagger.json
// to OpenAPI 3.x (JSON + YAML) and regenerates docs/docs.go with //go:embed.
//
// Run from apps/backend after: swag init -g cmd/api/main.go -o ./docs
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"gopkg.in/yaml.v3"
)

func main() {
	docsDir := "docs"
	if len(os.Args) > 1 {
		docsDir = os.Args[1]
	}
	swaggerPath := filepath.Join(docsDir, "swagger.json")
	raw, err := os.ReadFile(swaggerPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", swaggerPath, err)
		os.Exit(1)
	}
	var doc2 openapi2.T
	if err := json.Unmarshal(raw, &doc2); err != nil {
		fmt.Fprintf(os.Stderr, "parse swagger 2.0: %v\n", err)
		os.Exit(1)
	}
	doc3, err := openapi2conv.ToV3(&doc2)
	if err != nil {
		fmt.Fprintf(os.Stderr, "convert to OpenAPI 3: %v\n", err)
		os.Exit(1)
	}
	// Key order can vary with kin-openapi releases; scripts/post_swagger_openapi_tweaks.py
	// rewrites swagger.json with structural edits + json.dumps so CI/docs stay stable.
	jsonOut, err := json.MarshalIndent(doc3, "", "    ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal json: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(swaggerPath, jsonOut, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", swaggerPath, err)
		os.Exit(1)
	}
	yamlPath := filepath.Join(docsDir, "swagger.yaml")
	yamlOut, err := yaml.Marshal(doc3)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal yaml: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(yamlPath, yamlOut, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", yamlPath, err)
		os.Exit(1)
	}
	docsGo := filepath.Join(docsDir, "docs.go")
	const docsGoHeader = `// Package docs embeds the OpenAPI 3 API specification generated from Swagger 2.0 (swag) via kin-openapi.
// Run: swag init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3 && python3 scripts/post_swagger_openapi_tweaks.py
package docs

import _ "embed"

//go:embed swagger.json
var OpenAPIJSON []byte
`
	if err := os.WriteFile(docsGo, []byte(docsGoHeader), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", docsGo, err)
		os.Exit(1)
	}
}
