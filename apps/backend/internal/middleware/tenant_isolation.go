package middleware

import (
	"context"
)

const companyIDKey contextKey = "companyID"

// GetCompanyIDFromContext retrieves the company ID from the request context
func GetCompanyIDFromContext(ctx context.Context) string {
	if companyID, ok := ctx.Value(companyIDKey).(string); ok {
		return companyID
	}
	return ""
}

// SetCompanyIDInContext stores the company ID in the request context
func SetCompanyIDInContext(ctx context.Context, companyID string) context.Context {
	return context.WithValue(ctx, companyIDKey, companyID)
}
