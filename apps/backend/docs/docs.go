// Package docs embeds the OpenAPI 3 API specification generated from Swagger 2.0 (swag) via kin-openapi.
// Run: swag init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3 && python3 scripts/post_swagger_openapi_tweaks.py
package docs

import _ "embed"

//go:embed swagger.json
var OpenAPIJSON []byte
