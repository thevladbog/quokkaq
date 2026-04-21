// Package main — post-conversion OpenAPI 3 patches applied after swag → kin-openapi conversion.
//
// Every function in this file transforms *openapi3.T in-place. Errors are returned with context so
// the caller can print them and exit.
package main

import (
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

const colorPattern = `^#[0-9A-Fa-f]{6}$`

// applyTweaks applies all post-conversion patches to the OpenAPI 3 document.
func applyTweaks(doc *openapi3.T) error {
	if err := patchRootTagCounterBoard(doc); err != nil {
		return err
	}

	comp := doc.Components
	if comp == nil {
		return fmt.Errorf("applyTweaks: document has no components object")
	}

	// minLength: 1 on TerminalBootstrapRequest.code
	if err := setSchemaPropertyMinLength(comp, "handlers.TerminalBootstrapRequest", "code", 1); err != nil {
		return err
	}

	if err := patchPlanJSONObjectMaps(comp); err != nil {
		return err
	}

	if err := patchSecuritySchemesSessionCookie(doc); err != nil {
		return err
	}

	if err := patchSAMLACSRequestBodyRequired(doc); err != nil {
		return err
	}

	if err := patchAuthRedirect302Headers(doc); err != nil {
		return err
	}

	if err := patchAuthSetCookieResponseHeaders(doc); err != nil {
		return err
	}

	if err := patchAuthSSOExchangeResponseCookies(doc); err != nil {
		return err
	}

	if err := patchLoginLinkResponseSchema(doc); err != nil {
		return err
	}

	if err := patchTenantHintSSOProtocolEnums(comp); err != nil {
		return err
	}

	if err := patchAuthSSOAuthorizeLocaleEnum(doc); err != nil {
		return err
	}

	// No strict failure if the endpoint is missing (soft-fail in original).
	_ = patchStatisticsSurveyScoresQuestionIDsParam(doc)

	// minProperties on PATCH bodies where the server rejects an empty object.
	for _, name := range []string{
		"handlers.PatchTicketVisitorRequest",
		"handlers.PatchExternalIdentityJSON",
		"handlers.PatchUserSSOFlagsJSON",
		"handlers.PatchUserTenantRolesJSON",
		"handlers.PatchMeRequest",
	} {
		if err := setSchemaMinProps(comp, name, 1); err != nil {
			return err
		}
	}

	if err := patchColorPattern(comp, "handlers.createVisitorTagDefinitionRequest"); err != nil {
		return err
	}

	if err := setSchemaMinProps(comp, "handlers.patchVisitorTagDefinitionRequest", 1); err != nil {
		return err
	}
	if err := patchColorPattern(comp, "handlers.patchVisitorTagDefinitionRequest"); err != nil {
		return err
	}

	if err := patchCreateTicketRequest(comp); err != nil {
		return err
	}

	if err := patchUpsertGroupMappingJSON(comp); err != nil {
		return err
	}

	// required: ["url"] on upload response schemas.
	if err := setSchemaRequired(comp, "handlers.UploadLogoResponse", []string{"url"}); err != nil {
		return err
	}
	for _, name := range []string{
		"handlers.UploadSurveyCompletionImageResponse",
		"handlers.UploadSurveyIdleMediaResponse",
	} {
		if err := mergeSchemaRequiredIfPropPresent(comp, name, "url"); err != nil {
			return err
		}
	}

	if err := mergeSchemaRequired(comp, "handlers.createSurveyRequest", []string{"title", "questions"}); err != nil {
		return err
	}
	if err := mergeSchemaRequired(comp, "handlers.guestSurveySubmitRequest", []string{"ticketId", "surveyId", "answers"}); err != nil {
		return err
	}

	for _, pair := range []struct{ schema, prop string }{
		{"handlers.tenantHintRequest", "email"},
		{"handlers.ssoExchangeRequest", "code"},
		{"handlers.patchCompanySlugRequest", "slug"},
		{"handlers.PatchUserTenantRolesResponse", "tenantRoles"},
		{"handlers.PatchUserTenantRolesJSON", "tenantRoleIds"},
	} {
		if err := mergeSchemaRequiredIfPropPresent(comp, pair.schema, pair.prop); err != nil {
			return err
		}
	}

	if err := setSchemaMinProps(comp, "handlers.patchSurveyRequest", 1); err != nil {
		return err
	}

	if err := patchKioskConfigRequest(comp); err != nil {
		return err
	}

	// Calendar integration bodies: document `enabled` as required.
	for _, name := range []string{
		"services.CreateCalendarIntegrationRequest",
		"services.UpdateCalendarIntegrationRequest",
		"services.UpsertIntegrationRequest",
	} {
		if err := mergeSchemaRequiredIfPropPresent(comp, name, "enabled"); err != nil {
			return err
		}
	}

	if err := patchPrivacyConsentSchemas(comp); err != nil {
		return err
	}

	if err := patchModelsUpdateUserInput(comp); err != nil {
		return err
	}

	if err := patchModelsCompanyOneCSettingsPutRequestPassword(comp); err != nil {
		return err
	}

	if err := patchOneCStatusMappingInvoiceStatusEnum(comp); err != nil {
		return err
	}

	// maxLength on string fields (utf8.RuneCount limits from Go server code).
	type maxLenPatch struct {
		schema, prop string
		maxLen       uint64
	}
	for _, p := range []maxLenPatch{
		{"handlers.InvoiceDraftCreateBody", "paymentTerms", 32000},
		{"handlers.InvoiceDraftUpsertBody", "paymentTerms", 32000},
		{"handlers.InvoiceDraftLineInput", "lineComment", 512},
		{"models.Company", "invoiceDefaultPaymentTerms", 32000},
		{"models.Invoice", "paymentTerms", 32000},
		{"models.InvoiceLine", "lineComment", 512},
	} {
		if err := setStringPropMaxLength(comp, p.schema, p.prop, p.maxLen); err != nil {
			return err
		}
	}

	if err := patchCompanyMePatchSSOAccessSecurity(doc); err != nil {
		return err
	}

	// Soft-fail: endpoint may not be present in all build configurations.
	_ = patchGetExternalIdentity204NoBody(doc)

	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func getSchema(comp *openapi3.Components, name string) (*openapi3.Schema, error) {
	ref := comp.Schemas[name]
	if ref == nil || ref.Value == nil {
		return nil, fmt.Errorf("components.schemas[%q] missing or not an object "+
			"(swag/kin-openapi output may have changed — update schema names or tweak logic here)", name)
	}
	return ref.Value, nil
}

func setSchemaMinProps(comp *openapi3.Components, name string, min uint64) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	s.MinProps = min
	return nil
}

// setSchemaRequired replaces the required array (used when the caller owns the full list).
func setSchemaRequired(comp *openapi3.Components, name string, fields []string) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	s.Required = fields
	return nil
}

// mergeSchemaRequired unions extra keys into the existing required array.
func mergeSchemaRequired(comp *openapi3.Components, name string, extra []string) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	seen := make(map[string]bool, len(s.Required))
	for _, r := range s.Required {
		seen[r] = true
	}
	for _, r := range extra {
		if !seen[r] {
			s.Required = append(s.Required, r)
			seen[r] = true
		}
	}
	return nil
}

func mergeSchemaRequiredIfPropPresent(comp *openapi3.Components, name, prop string) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("components.schemas[%q].properties missing or not an object", name)
	}
	if _, ok := s.Properties[prop]; !ok {
		return fmt.Errorf("components.schemas[%q].properties[%q] missing "+
			"(schema drift — update swag annotations or tweak logic here)", name, prop)
	}
	return mergeSchemaRequired(comp, name, []string{prop})
}

func setStringPropMaxLength(comp *openapi3.Components, name, prop string, maxLen uint64) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("components.schemas[%q].properties missing or not an object", name)
	}
	pRef, ok := s.Properties[prop]
	if !ok || pRef == nil || pRef.Value == nil {
		return fmt.Errorf("components.schemas[%q].properties[%q] missing "+
			"(schema drift — update swag annotations or tweak logic here)", name, prop)
	}
	pRef.Value.MaxLength = &maxLen
	return nil
}

func setSchemaPropertyMinLength(comp *openapi3.Components, name, prop string, minLen uint64) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("components.schemas[%q].properties missing", name)
	}
	pRef, ok := s.Properties[prop]
	if !ok || pRef == nil || pRef.Value == nil {
		return fmt.Errorf("components.schemas[%q].properties[%q] missing", name, prop)
	}
	pRef.Value.MinLength = minLen
	return nil
}

func patchColorPattern(comp *openapi3.Components, name string) error {
	s, err := getSchema(comp, name)
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("components.schemas[%q].properties missing", name)
	}
	colorRef, ok := s.Properties["color"]
	if !ok || colorRef == nil || colorRef.Value == nil {
		return fmt.Errorf("components.schemas[%q].properties.color missing", name)
	}
	colorRef.Value.Pattern = colorPattern
	return nil
}

func boolPtr(b bool) *bool { return &b }

func strPtr(s string) *string { return &s }

func newSetCookieHeader(description string) *openapi3.HeaderRef {
	return &openapi3.HeaderRef{
		Value: &openapi3.Header{
			Parameter: openapi3.Parameter{
				Description: description,
				Schema:      openapi3.NewSchemaRef("", openapi3.NewStringSchema()),
			},
		},
	}
}

func ensureHeaders(resp *openapi3.Response) {
	if resp.Headers == nil {
		resp.Headers = openapi3.Headers{}
	}
}

// ── patch functions ───────────────────────────────────────────────────────────

func patchRootTagCounterBoard(doc *openapi3.T) error {
	const (
		tagName = "counter-board"
		tagDesc = "Above-counter ticket display for paired counter_board terminals (terminal JWT). " +
			"Session for workplace display; separate from guest-survey survey flows."
	)
	if t := doc.Tags.Get(tagName); t != nil {
		if t.Description == "" {
			t.Description = tagDesc
		}
		return nil
	}
	doc.Tags = append(doc.Tags, &openapi3.Tag{Name: tagName, Description: tagDesc})
	return nil
}

func patchPlanJSONObjectMaps(comp *openapi3.Components) error {
	// json.RawMessage maps swag emits as plain type:object; additionalProperties makes them
	// Record<string, T> in Orval instead of opaque any.
	propValueTypes := map[string]string{
		"limits":           "integer",
		"features":         "boolean",
		"limitsNegotiable": "boolean",
	}
	schemaKeys := []string{
		"models.SubscriptionPlan",
		"handlers.PlatformCreateSubscriptionPlanBody",
		"handlers.PlatformUpdateSubscriptionPlanBody",
	}
	patched := 0
	for _, key := range schemaKeys {
		sRef := comp.Schemas[key]
		if sRef == nil || sRef.Value == nil {
			continue
		}
		s := sRef.Value
		if s.Properties == nil {
			continue
		}
		for propName, valueType := range propValueTypes {
			pRef := s.Properties[propName]
			if pRef == nil || pRef.Value == nil {
				continue
			}
			p := pRef.Value
			if !p.Type.Is("object") {
				continue
			}
			// skip if already patched
			if p.AdditionalProperties.Schema != nil || p.AdditionalProperties.Has != nil {
				patched++
				continue
			}
			var addlSchema *openapi3.Schema
			switch valueType {
			case "integer":
				addlSchema = openapi3.NewIntegerSchema()
			case "boolean":
				addlSchema = openapi3.NewBoolSchema()
			default:
				addlSchema = openapi3.NewStringSchema()
			}
			p.AdditionalProperties = openapi3.AdditionalProperties{
				Schema: openapi3.NewSchemaRef("", addlSchema),
			}
			patched++
		}
	}
	if patched == 0 {
		return fmt.Errorf("applyTweaks: no plan map object properties patched "+
			"(expected inline type:object props [features limits limitsNegotiable] on at least one of %v; swag/OpenAPI drift?)",
			schemaKeys)
	}
	return nil
}

func patchSecuritySchemesSessionCookie(doc *openapi3.T) error {
	comp := doc.Components
	if comp == nil {
		return fmt.Errorf("patchSecuritySchemesSessionCookie: missing components (required for SessionCookie security scheme)")
	}
	if comp.SecuritySchemes == nil {
		return fmt.Errorf("patchSecuritySchemesSessionCookie: missing components.securitySchemes (required for SessionCookie)")
	}
	if _, ok := comp.SecuritySchemes["SessionCookie"]; !ok {
		comp.SecuritySchemes["SessionCookie"] = &openapi3.SecuritySchemeRef{
			Value: &openapi3.SecurityScheme{
				Type: "apiKey",
				In:   "cookie",
				Name: "quokkaq_refresh",
				Description: "HttpOnly refresh JWT cookie (same-origin /api). When present, POST /auth/refresh " +
					"does not require Authorization. POST /auth/logout clears this cookie (and the access " +
					"cookie) via Set-Cookie. Legacy clients may still send Bearer refresh.",
			},
		}
	}

	refreshItem := doc.Paths.Value("/auth/refresh")
	if refreshItem == nil {
		return fmt.Errorf("patchSecuritySchemesSessionCookie: paths['/auth/refresh'] missing (required for SessionCookie security patch)")
	}
	post := refreshItem.Post
	if post == nil {
		return fmt.Errorf("patchSecuritySchemesSessionCookie: paths['/auth/refresh'].post missing (required for SessionCookie security patch)")
	}
	sec := openapi3.SecurityRequirements{
		{"BearerAuth": []string{}},
		{"SessionCookie": []string{}},
	}
	post.Security = &sec
	return nil
}

func patchSAMLACSRequestBodyRequired(doc *openapi3.T) error {
	acsItem := doc.Paths.Value("/auth/saml/acs")
	if acsItem == nil {
		return fmt.Errorf("patchSAMLACSRequestBodyRequired: paths['/auth/saml/acs'] missing (required for SAML ACS requestBody patch)")
	}
	post := acsItem.Post
	if post == nil {
		return fmt.Errorf("patchSAMLACSRequestBodyRequired: paths['/auth/saml/acs'].post missing")
	}
	if post.RequestBody == nil || post.RequestBody.Value == nil {
		return fmt.Errorf("patchSAMLACSRequestBodyRequired: paths['/auth/saml/acs'].post.requestBody missing")
	}
	post.RequestBody.Value.Required = true
	return nil
}

func patchAuthRedirect302Headers(doc *openapi3.T) error {
	type redirectPatch struct {
		path, method, desc string
	}
	patches := []redirectPatch{
		{"/auth/saml/acs", "post", "Redirect to app with one-time code"},
		{"/auth/sso/authorize", "get", "Redirect to IdP authorization endpoint"},
		{"/auth/sso/callback", "get", "Redirect to app after OIDC callback"},
	}
	for _, p := range patches {
		item := doc.Paths.Value(p.path)
		if item == nil {
			continue
		}
		op := item.GetOperation(strings.ToUpper(p.method))
		if op == nil {
			continue
		}
		if op.Responses == nil {
			continue
		}
		r302 := op.Responses.Value("302")
		if r302 == nil || r302.Value == nil {
			continue
		}
		resp := r302.Value
		if resp.Description != nil {
			resp.Description = strPtr(p.desc)
		} else {
			resp.Description = strPtr(p.desc)
		}
		ensureHeaders(resp)
		resp.Headers["Location"] = &openapi3.HeaderRef{
			Value: &openapi3.Header{
				Parameter: openapi3.Parameter{
					Description: "Absolute or relative URL the client should follow (RFC 9110).",
					Schema: openapi3.NewSchemaRef("", &openapi3.Schema{
						Type:   &openapi3.Types{"string"},
						Format: "uri-reference",
					}),
				},
			},
		}
	}
	return nil
}

const (
	setCookieLoginRefreshDesc = "When present, sets or rotates browser session cookies: `quokkaq_access` and `quokkaq_refresh` " +
		"HttpOnly JWTs (Path=/; SameSite=Lax; Secure). Used after successful login or token refresh; " +
		"the JSON body may still include access tokens for legacy clients (refresh only via cookies). See components.securitySchemes.SessionCookie."
	setCookieLogoutDesc = "Clears the browser session: `quokkaq_access` and `quokkaq_refresh` are typically sent as " +
		"Set-Cookie with empty values and Max-Age=0 (or expired) so the browser drops them " +
		"(HttpOnly, Path=/, SameSite=Lax, Secure). The header may be omitted if there was no session cookie."
	setCookieDescExtra = " Refresh session is carried by the `quokkaq_refresh` cookie (SessionCookie); " +
		"JSON may still include access tokens for legacy clients."
)

func patchAuthSetCookieResponseHeaders(doc *openapi3.T) error {
	type target struct {
		path, method, code, cookieDesc string
	}
	targets := []target{
		{"/auth/login", "post", "200", setCookieLoginRefreshDesc},
		{"/auth/refresh", "post", "200", setCookieLoginRefreshDesc},
		{"/auth/logout", "post", "204", setCookieLogoutDesc},
	}
	for _, t := range targets {
		item := doc.Paths.Value(t.path)
		if item == nil {
			return fmt.Errorf("patchAuthSetCookieResponseHeaders: paths[%q] missing (required for Set-Cookie patch)", t.path)
		}
		op := item.GetOperation(strings.ToUpper(t.method))
		if op == nil {
			return fmt.Errorf("patchAuthSetCookieResponseHeaders: paths[%q].%s missing (required for Set-Cookie patch)", t.path, t.method)
		}
		if op.Responses == nil {
			return fmt.Errorf("patchAuthSetCookieResponseHeaders: paths[%q].%s.responses missing", t.path, t.method)
		}
		rRef := op.Responses.Value(t.code)
		if rRef == nil || rRef.Value == nil {
			return fmt.Errorf("patchAuthSetCookieResponseHeaders: paths[%q].%s.responses[%q] missing", t.path, t.method, t.code)
		}
		resp := rRef.Value
		ensureHeaders(resp)
		resp.Headers["Set-Cookie"] = newSetCookieHeader(t.cookieDesc)

		if t.code == "204" {
			resp.Description = strPtr("No Content")
		} else if resp.Description != nil {
			d := *resp.Description
			if !strings.Contains(strings.ToLower(d), "quokkaq_refresh") {
				resp.Description = strPtr(strings.TrimRight(d, ".") + "." + setCookieDescExtra)
			}
		}
	}
	return nil
}

func patchAuthSSOExchangeResponseCookies(doc *openapi3.T) error {
	const setCookieSSOExchangeDesc = "Sets the same session cookies as password login: `quokkaq_access` and `quokkaq_refresh` " +
		"HttpOnly JWTs (Path=/; SameSite=Lax; Secure; refresh ~30d, access ~24h Max-Age). " +
		"Returned together with the JSON body from this endpoint."

	item := doc.Paths.Value("/auth/sso/exchange")
	if item == nil {
		return fmt.Errorf("patchAuthSSOExchangeResponseCookies: paths['/auth/sso/exchange'] missing")
	}
	post := item.Post
	if post == nil {
		return fmt.Errorf("patchAuthSSOExchangeResponseCookies: paths['/auth/sso/exchange'].post missing")
	}
	if post.Responses == nil {
		return fmt.Errorf("patchAuthSSOExchangeResponseCookies: paths['/auth/sso/exchange'].post.responses missing")
	}
	r200 := post.Responses.Value("200")
	if r200 == nil || r200.Value == nil {
		return fmt.Errorf("patchAuthSSOExchangeResponseCookies: paths['/auth/sso/exchange'].post.responses['200'] missing")
	}
	resp := r200.Value
	ensureHeaders(resp)
	resp.Headers["Set-Cookie"] = newSetCookieHeader(setCookieSSOExchangeDesc)
	if resp.Description != nil {
		d := *resp.Description
		if !strings.Contains(strings.ToLower(d), "quokkaq_access") {
			resp.Description = strPtr(
				strings.TrimRight(d, ".") +
					". Session cookies (`quokkaq_access`, `quokkaq_refresh`) are set as in POST /auth/login.")
		}
	}
	return nil
}

func patchLoginLinkResponseSchema(doc *openapi3.T) error {
	comp := doc.Components
	if comp == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: missing components")
	}

	comp.Schemas["handlers.LoginLinkResponse"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		Type:     &openapi3.Types{"object"},
		Required: []string{"token", "exampleUrl"},
		Properties: openapi3.Schemas{
			"token": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:        &openapi3.Types{"string"},
				Description: "Opaque tenant login token for strict-tenant links",
			}),
			"exampleUrl": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:        &openapi3.Types{"string"},
				Format:      "uri",
				Description: "Example full login URL including the token query parameter",
			}),
		},
	})

	item := doc.Paths.Value("/companies/me/login-links")
	if item == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'] missing (required for login-links response schema patch)")
	}
	post := item.Post
	if post == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'].post missing")
	}
	if post.Responses == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'].post.responses missing")
	}
	r200 := post.Responses.Value("200")
	if r200 == nil || r200.Value == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'].post.responses['200'] missing")
	}
	content := r200.Value.Content
	if content == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'].post.responses['200'].content missing")
	}
	appJSON := content["application/json"]
	if appJSON == nil {
		return fmt.Errorf("patchLoginLinkResponseSchema: paths['/companies/me/login-links'].post.responses['200'].content['application/json'] missing")
	}
	appJSON.Schema = openapi3.NewSchemaRef("#/components/schemas/handlers.LoginLinkResponse", nil)
	return nil
}

func patchTenantHintSSOProtocolEnums(comp *openapi3.Components) error {
	th, err := getSchema(comp, "services.TenantHintResponse")
	if err != nil {
		return err
	}
	if th.Properties != nil {
		if nextRef := th.Properties["next"]; nextRef != nil && nextRef.Value != nil {
			nextRef.Value.Enum = []any{"sso", "password", "choose_slug"}
		}
	}

	for _, name := range []string{"services.CompanySSOGetResponse", "services.CompanySSOPatch"} {
		s, err := getSchema(comp, name)
		if err != nil {
			return err
		}
		if s.Properties == nil {
			continue
		}
		if spRef := s.Properties["ssoProtocol"]; spRef != nil && spRef.Value != nil {
			spRef.Value.Enum = []any{"oidc", "saml"}
		}
	}
	return nil
}

func patchAuthSSOAuthorizeLocaleEnum(doc *openapi3.T) error {
	item := doc.Paths.Value("/auth/sso/authorize")
	if item == nil {
		return fmt.Errorf("patchAuthSSOAuthorizeLocaleEnum: paths['/auth/sso/authorize'] missing (required for locale query enum patch)")
	}
	get := item.Get
	if get == nil {
		return fmt.Errorf("patchAuthSSOAuthorizeLocaleEnum: paths['/auth/sso/authorize'].get missing (required for locale query enum patch)")
	}
	for _, pRef := range get.Parameters {
		if pRef == nil || pRef.Value == nil {
			continue
		}
		p := pRef.Value
		if p.Name == "locale" && p.In == "query" {
			if p.Schema == nil {
				p.Schema = openapi3.NewSchemaRef("", openapi3.NewStringSchema())
			} else if p.Schema.Value == nil {
				p.Schema.Value = openapi3.NewStringSchema()
			}
			if p.Schema.Value.Type == nil {
				p.Schema.Value.Type = &openapi3.Types{"string"}
			}
			p.Schema.Value.Enum = []any{"en", "ru"}
			return nil
		}
	}
	return fmt.Errorf("patchAuthSSOAuthorizeLocaleEnum: missing `locale` query parameter on GET /auth/sso/authorize (required for locale query enum patch)")
}

func patchStatisticsSurveyScoresQuestionIDsParam(doc *openapi3.T) error {
	item := doc.Paths.Value("/units/{unitId}/statistics/survey-scores")
	if item == nil {
		return nil
	}
	get := item.Get
	if get == nil {
		return nil
	}
	for _, pRef := range get.Parameters {
		if pRef == nil || pRef.Value == nil {
			continue
		}
		p := pRef.Value
		if p.Name == "questionIds" && p.In == "query" {
			p.Style = "form"
			p.Explode = boolPtr(true)
			return nil
		}
	}
	return nil
}

func patchCreateTicketRequest(comp *openapi3.Components) error {
	falseVal := false

	comp.Schemas["handlers.CreateTicketRequestAnonymous"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		Type:                 &openapi3.Types{"object"},
		Required:             []string{"serviceId"},
		AdditionalProperties: openapi3.AdditionalProperties{Has: &falseVal},
		Properties: openapi3.Schemas{
			"serviceId": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:      &openapi3.Types{"string"},
				MinLength: 1,
			}),
		},
	})

	comp.Schemas["handlers.CreateTicketRequestStaff"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		Type:                 &openapi3.Types{"object"},
		Required:             []string{"serviceId", "clientId"},
		AdditionalProperties: openapi3.AdditionalProperties{Has: &falseVal},
		Properties: openapi3.Schemas{
			"serviceId": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:      &openapi3.Types{"string"},
				MinLength: 1,
			}),
			"clientId": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:      &openapi3.Types{"string"},
				MinLength: 1,
			}),
		},
	})

	comp.Schemas["handlers.CreateTicketRequestKiosk"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		Type:                 &openapi3.Types{"object"},
		Required:             []string{"serviceId", "visitorPhone", "visitorLocale"},
		AdditionalProperties: openapi3.AdditionalProperties{Has: &falseVal},
		Properties: openapi3.Schemas{
			"serviceId": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:      &openapi3.Types{"string"},
				MinLength: 1,
			}),
			"visitorPhone": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:      &openapi3.Types{"string"},
				MinLength: 1,
			}),
			"visitorLocale": openapi3.NewSchemaRef("", &openapi3.Schema{
				Type: &openapi3.Types{"string"},
				Enum: []any{"en", "ru"},
			}),
		},
	})

	comp.Schemas["handlers.CreateTicketRequest"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		OneOf: openapi3.SchemaRefs{
			openapi3.NewSchemaRef("#/components/schemas/handlers.CreateTicketRequestAnonymous", nil),
			openapi3.NewSchemaRef("#/components/schemas/handlers.CreateTicketRequestStaff", nil),
			openapi3.NewSchemaRef("#/components/schemas/handlers.CreateTicketRequestKiosk", nil),
		},
	})
	return nil
}

func patchUpsertGroupMappingJSON(comp *openapi3.Components) error {
	falseVal := false

	idProp := &openapi3.Schema{
		Type:        &openapi3.Types{"string"},
		MinLength:   1,
		Description: "IdP group identifier (e.g. Azure AD group object id).",
	}

	comp.Schemas["handlers.UpsertGroupMappingJSON"] = openapi3.NewSchemaRef("", &openapi3.Schema{
		Description: "Map an IdP group to exactly one target: a tenant role id, or a legacy global role name. " +
			"Send idpGroupId plus either tenantRoleId or legacyRoleName (not both).",
		OneOf: openapi3.SchemaRefs{
			openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:                 &openapi3.Types{"object"},
				Required:             []string{"idpGroupId", "tenantRoleId"},
				AdditionalProperties: openapi3.AdditionalProperties{Has: &falseVal},
				Properties: openapi3.Schemas{
					"idpGroupId": openapi3.NewSchemaRef("", idProp),
					"tenantRoleId": openapi3.NewSchemaRef("", &openapi3.Schema{
						Type:        &openapi3.Types{"string"},
						MinLength:   1,
						Description: "Tenant role UUID in this company. Mutually exclusive with legacyRoleName.",
					}),
				},
			}),
			openapi3.NewSchemaRef("", &openapi3.Schema{
				Type:                 &openapi3.Types{"object"},
				Required:             []string{"idpGroupId", "legacyRoleName"},
				AdditionalProperties: openapi3.AdditionalProperties{Has: &falseVal},
				Properties: openapi3.Schemas{
					"idpGroupId": openapi3.NewSchemaRef("", idProp),
					"legacyRoleName": openapi3.NewSchemaRef("", &openapi3.Schema{
						Type: &openapi3.Types{"string"},
						Description: "Legacy global role name applied by SSO group sync. " +
							"Mutually exclusive with tenantRoleId.",
						Enum: []any{"staff", "supervisor", "operator"},
					}),
				},
			}),
		},
	})
	return nil
}

func patchKioskConfigRequest(comp *openapi3.Components) error {
	s, err := getSchema(comp, "handlers.PatchUnitKioskConfigRequest")
	if err != nil {
		return err
	}
	s.Required = []string{"config"}
	if s.Properties != nil {
		if cfgRef := s.Properties["config"]; cfgRef != nil && cfgRef.Value != nil {
			cfgRef.Value.Required = []string{"kiosk"}
		}
	}
	return nil
}

func patchPrivacyConsentSchemas(comp *openapi3.Components) error {
	trueOnly := &openapi3.Schema{
		Type: &openapi3.Types{"boolean"},
		Enum: []any{true},
	}

	for _, info := range []struct {
		name  string
		extra []string // extra required fields beyond privacyConsentAccepted
	}{
		{"handlers.PublicLeadRequestBody", nil},
		{"handlers.RegisterUserRequest", []string{"name", "password", "token"}},
		{"handlers.SignupRequest", nil},
	} {
		s, err := getSchema(comp, info.name)
		if err != nil {
			return err
		}
		if s.Properties == nil {
			return fmt.Errorf("patchPrivacyConsentSchemas: %s.properties missing or invalid", info.name)
		}
		if _, ok := s.Properties["privacyConsentAccepted"]; !ok {
			return fmt.Errorf("patchPrivacyConsentSchemas: %s.properties.privacyConsentAccepted missing (swag drift?)", info.name)
		}
		s.Properties["privacyConsentAccepted"] = openapi3.NewSchemaRef("", trueOnly)

		required := []string{"privacyConsentAccepted"}
		required = append(required, info.extra...)
		if err := mergeSchemaRequired(comp, info.name, required); err != nil {
			return err
		}
	}
	return nil
}

func patchModelsUpdateUserInput(comp *openapi3.Components) error {
	s, err := getSchema(comp, "models.UpdateUserInput")
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("patchModelsUpdateUserInput: models.UpdateUserInput.properties missing or not an object")
	}
	pwdRef := s.Properties["password"]
	if pwdRef == nil || pwdRef.Value == nil {
		return fmt.Errorf("patchModelsUpdateUserInput: models.UpdateUserInput.properties.password missing")
	}
	pwdRef.Value.WriteOnly = true
	pwdRef.Value.Format = "password"

	photoRef := s.Properties["photoUrl"]
	if photoRef == nil || photoRef.Value == nil {
		return fmt.Errorf("patchModelsUpdateUserInput: models.UpdateUserInput.properties.photoUrl missing")
	}
	photoRef.Value.Description = "URL of the user's profile photo. Send an empty string to clear the photo; " +
		"omit the field to leave the current value unchanged."
	return nil
}

func patchModelsCompanyOneCSettingsPutRequestPassword(comp *openapi3.Components) error {
	s, err := getSchema(comp, "models.CompanyOneCSettingsPutRequest")
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("patchModelsCompanyOneCSettingsPutRequestPassword: models.CompanyOneCSettingsPutRequest.properties missing")
	}
	pwdRef := s.Properties["httpPassword"]
	if pwdRef == nil || pwdRef.Value == nil {
		return fmt.Errorf("patchModelsCompanyOneCSettingsPutRequestPassword: models.CompanyOneCSettingsPutRequest.properties.httpPassword missing")
	}
	pwdRef.Value.WriteOnly = true
	pwdRef.Value.Format = "password"
	return nil
}

func patchOneCStatusMappingInvoiceStatusEnum(comp *openapi3.Components) error {
	s, err := getSchema(comp, "models.OneCStatusMappingRuleDTO")
	if err != nil {
		return err
	}
	if s.Properties == nil {
		return fmt.Errorf("patchOneCStatusMappingInvoiceStatusEnum: models.OneCStatusMappingRuleDTO.properties missing")
	}
	invRef := s.Properties["invoiceStatus"]
	if invRef == nil || invRef.Value == nil {
		return fmt.Errorf("patchOneCStatusMappingInvoiceStatusEnum: models.OneCStatusMappingRuleDTO.properties.invoiceStatus missing")
	}
	invRef.Value.Type = &openapi3.Types{"string"}
	invRef.Value.Enum = []any{"paid", "void", "uncollectible"}
	return nil
}

func patchCompanyMePatchSSOAccessSecurity(doc *openapi3.T) error {
	comp := doc.Components
	if comp == nil {
		return fmt.Errorf("patchCompanyMePatchSSOAccessSecurity: components missing")
	}
	if comp.SecuritySchemes == nil {
		return fmt.Errorf("patchCompanyMePatchSSOAccessSecurity: components.securitySchemes not an object")
	}
	delete(comp.SecuritySchemes, "QuokkaQLogicalScopes")
	if _, ok := comp.SecuritySchemes["BearerAuth"]; !ok {
		return fmt.Errorf("patchCompanyMePatchSSOAccessSecurity: BearerAuth missing (cannot patch PATCH /companies/me security)")
	}

	meItem := doc.Paths.Value("/companies/me")
	if meItem == nil {
		return fmt.Errorf("patchCompanyMePatchSSOAccessSecurity: paths['/companies/me'] missing")
	}
	patchOp := meItem.Patch
	if patchOp == nil {
		return fmt.Errorf("patchCompanyMePatchSSOAccessSecurity: PATCH /companies/me missing (swag/kin drift)")
	}

	bearerOnly := openapi3.SecurityRequirements{
		{"BearerAuth": []string{}},
	}
	patchOp.Security = &bearerOnly

	if patchOp.Extensions == nil {
		patchOp.Extensions = make(map[string]any)
	}
	patchOp.Extensions["x-logical-scopes"] = map[string]any{
		"description": "Logical scopes for company-wide tenant settings (documentation only). " +
			"Clients send `Authorization: Bearer` JWT; the server enforces these rules in code. " +
			"For `models.CompanyPatch.ssoAccessSource`, the caller must match scope " +
			"`company.settings.ssoAccessSource`, satisfied when the principal matches any of " +
			"`global.role.admin`, `global.role.platform_admin`, or `company.tenant_role.system_admin`. " +
			"Scope `unit.tenant.admin` (unit-only `tenant.admin` permission) is not sufficient alone.",
		"scopes": map[string]any{
			"company.settings.ssoAccessSource": "Change company SSO access provisioning (`manual` vs `sso_groups`). " +
				"Equivalent to any of global.role.admin, global.role.platform_admin, " +
				"company.tenant_role.system_admin (not unit.tenant.admin alone).",
			"global.role.admin":                "Global administrator (role name `admin`).",
			"global.role.platform_admin":       "Platform administrator (role `platform_admin`).",
			"company.tenant_role.system_admin": "Company tenant role slug `system_admin`.",
			"unit.tenant.admin":                "Unit-scoped `tenant.admin` permission — NOT sufficient for ssoAccessSource alone.",
		},
	}
	return nil
}

func patchGetExternalIdentity204NoBody(doc *openapi3.T) error {
	item := doc.Paths.Value("/companies/me/users/{userId}/external-identity")
	if item == nil {
		return nil
	}
	get := item.Get
	if get == nil {
		return nil
	}
	if get.Responses == nil {
		return nil
	}
	r204 := get.Responses.Value("204")
	if r204 == nil || r204.Value == nil {
		return nil
	}
	r204.Value.Content = nil
	return nil
}
