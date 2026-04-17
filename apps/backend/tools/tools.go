//go:build tools

// Package tools records tool-only dependencies (e.g. swag) so they stay in go.mod after go mod tidy.
// CI runs swag init then cmd/swagger-to-openapi3; committed docs/docs.go embeds OpenAPI JSON only.
package tools

import _ "github.com/swaggo/swag"
