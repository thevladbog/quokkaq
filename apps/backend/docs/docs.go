// Package docs embeds the OpenAPI 3 API specification generated from Swagger 2.0 (swag) via kin-openapi.
// Run from apps/backend: go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3
// Or via Nx from repo root: pnpm nx run backend:openapi
package docs

import _ "embed"

//go:embed openapi.json
var OpenAPIJSON []byte
