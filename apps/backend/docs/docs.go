// Package docs embeds the OpenAPI 3 API specification generated from Swagger 2.0 (swag) via kin-openapi.
// Run from apps/backend: swag init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3
package docs

import _ "embed"

//go:embed openapi.json
var OpenAPIJSON []byte
