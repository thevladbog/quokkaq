//go:build tools

// Package tools records tool-only dependencies (e.g. swag) so they stay in go.mod after go mod tidy.
// docs/docs.go may import github.com/swaggo/swag when using default swag init output.
package tools

import _ "github.com/swaggo/swag"
