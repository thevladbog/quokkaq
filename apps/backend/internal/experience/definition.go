// Package experience validates the bounded JSON envelope stored by published experience versions.
package experience

import (
	"bytes"
	"encoding/json"
	"math"
	"regexp"
	"sort"
)

const (
	SurfaceTicketStation  = "ticket-station"
	SurfaceQueueDisplay   = "queue-display"
	SurfaceCounterDisplay = "counter-display"
	SurfaceVisitorMobile  = "visitor-mobile"

	CodeSchemaInvalid               = "schema.invalid"
	CodePageStartMissing            = "page.start_missing"
	CodePageUnreachable             = "page.unreachable"
	CodeActionTargetMissing         = "action.target_missing"
	CodeWidgetUnsupportedForSurface = "widget.unsupported_for_surface"
	CodeVariantUnplacedWidget       = "variant.unplaced_widget"
	CodeVariantPlacementOverflow    = "variant.placement_overflow"
	CodeVariantPlacementOverlap     = "variant.placement_overlap"
	CodeFlowRequiredPageMissing     = "flow.required_page_missing"
	CodeConditionInvalid            = "condition.invalid"
	CodeTouchTargetTooSmall         = "touch.target_too_small"
	CodeStationPageScrollRequired   = "station.page_scroll_required"

	// MaxDefinitionBytes is shared by transport, service, and publish validation.
	// The cap is checked before any recursive JSON work.
	MaxDefinitionBytes = 1 << 20

	maxDefinitionPages      = 100
	maxWidgetsPerPage       = 200
	maxActionsPerWidget     = 20
	maxDefinitionVariants   = 8
	maxConditionNodes       = 100
	maxDefinitionIssues     = 200
	maxDefinitionPlacements = 200
	minimumTouchTargetPX    = 56
)

var (
	hexColorPattern  = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	legacyRouteSlots = []string{"service-info", "service-form", "identity", "confirmation", "success"}
	flowPageForSlot  = map[string]string{
		"service-info": "serviceInfoPageId",
		"service-form": "serviceFormPageId",
		"identity":     "identityPageId",
		"appointment":  "appointmentPageId",
		"confirmation": "confirmationPageId",
		"success":      "successPageId",
	}
	allowedFlowRoles = map[string]struct{}{
		"serviceCatalogPageId": {}, "serviceInfoPageId": {}, "serviceFormPageId": {},
		"identityPageId": {}, "appointmentPageId": {}, "confirmationPageId": {}, "successPageId": {},
	}
	allowedSurfaces = map[string]struct{}{
		SurfaceTicketStation: {}, SurfaceQueueDisplay: {}, SurfaceCounterDisplay: {}, SurfaceVisitorMobile: {},
	}
	allowedWidgetTypes = map[string]struct{}{
		"called-tickets": {}, "content-player": {}, "queue-stats": {}, "eta-display": {},
		"announcements": {}, "rss-feed": {}, "weather": {}, "clock": {}, "queue-ticker": {},
		"custom-html": {}, "screen-header": {}, "screen-footer-qr": {}, "join-queue-qr": {},
		"service-picker": {}, "rich-info": {}, "ticket-form": {}, "identify": {},
		"language-switch": {}, "ticket-success": {}, "media": {},
	}
	displayBlockedWidgetTypes = map[string]struct{}{
		"service-picker": {}, "ticket-form": {}, "identify": {}, "ticket-success": {},
	}
	visitorMobileWidgetTypes = map[string]struct{}{
		"service-picker": {}, "rich-info": {}, "ticket-form": {}, "language-switch": {},
		"ticket-success": {}, "media": {}, "eta-display": {}, "clock": {}, "join-queue-qr": {},
	}
	interactiveWidgetTypes = map[string]struct{}{
		"service-picker": {}, "rich-info": {}, "ticket-form": {}, "identify": {},
		"language-switch": {}, "ticket-success": {},
	}
)

// ValidationIssue uses Task 5's stable publish-blocking code vocabulary.
// Path is structural only and never includes ids, config values, or visitor data.
type ValidationIssue struct {
	Code string `json:"code"`
	Path string `json:"path,omitempty"`
}

// ValidationError deliberately has a redacted Error string. Callers may inspect
// Issues for stable codes, but raw definition data is never included.
type ValidationError struct {
	Issues []ValidationIssue
}

func (e *ValidationError) Error() string { return "experience definition is not publishable" }

type definitionEnvelope struct {
	SchemaVersion int                 `json:"schemaVersion"`
	ID            string              `json:"id"`
	Surface       string              `json:"surface"`
	StartPageID   string              `json:"startPageId"`
	Variants      []definitionVariant `json:"variants"`
	Pages         []definitionPage    `json:"pages"`
	FlowPages     json.RawMessage     `json:"flowPages"`
	Theme         json.RawMessage     `json:"theme"`
}

type definitionVariant struct {
	ID      string             `json:"id"`
	Profile *definitionProfile `json:"profile"`
	Grid    *definitionGrid    `json:"grid"`
}

type definitionProfile struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	Width           int                 `json:"width"`
	Height          int                 `json:"height"`
	InteractionMode string              `json:"interactionMode"`
	ViewingDistance string              `json:"viewingDistance"`
	SafeArea        *definitionSafeArea `json:"safeArea"`
}

type definitionSafeArea struct {
	Top    int `json:"top"`
	Right  int `json:"right"`
	Bottom int `json:"bottom"`
	Left   int `json:"left"`
}

type definitionGrid struct {
	Columns int `json:"columns"`
	Rows    int `json:"rows"`
}

type definitionPage struct {
	ID      string                      `json:"id"`
	Name    string                      `json:"name"`
	Widgets []definitionWidget          `json:"widgets"`
	Access  json.RawMessage             `json:"access"`
	Layouts map[string]definitionLayout `json:"layouts"`
}

type definitionWidget struct {
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	Config  json.RawMessage `json:"config"`
	Tone    json.RawMessage `json:"tone"`
	Access  json.RawMessage `json:"access"`
	Actions json.RawMessage `json:"actions"`
}

type definitionLayout struct {
	Placements      map[string]definitionPlacement `json:"placements"`
	TypographyScale json.RawMessage                `json:"typographyScale"`
}

type definitionPlacement struct {
	Col     int `json:"col"`
	Row     int `json:"row"`
	ColSpan int `json:"colSpan"`
	RowSpan int `json:"rowSpan"`
}

type definitionAction struct {
	Type     string
	ToPageID string
}

type legacyRouting struct {
	Routes []legacyServiceRoute
}

type legacyServiceRoute struct {
	ServiceID          string
	IdentificationMode string
	Slots              []string
	TerminalAction     string
}

type issueCollector struct {
	issues []ValidationIssue
	seen   map[string]struct{}
}

func newIssueCollector() *issueCollector {
	return &issueCollector{seen: make(map[string]struct{})}
}

func (c *issueCollector) add(code, path string) {
	if len(c.issues) >= maxDefinitionIssues {
		return
	}
	key := code + "\x00" + path
	if _, ok := c.seen[key]; ok {
		return
	}
	c.seen[key] = struct{}{}
	c.issues = append(c.issues, ValidationIssue{Code: code, Path: path})
}

func (c *issueCollector) err() error {
	if len(c.issues) == 0 {
		return nil
	}
	sort.Slice(c.issues, func(i, j int) bool {
		if c.issues[i].Path == c.issues[j].Path {
			return c.issues[i].Code < c.issues[j].Code
		}
		return c.issues[i].Path < c.issues[j].Path
	})
	return &ValidationError{Issues: append([]ValidationIssue(nil), c.issues...)}
}

func rawJSONObject(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) >= 2 && trimmed[0] == '{' && trimmed[len(trimmed)-1] == '}'
}

func decodeRawObject(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	if !rawJSONObject(raw) {
		return nil, false
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, false
	}
	return object, true
}

func hasObjectShape(object map[string]json.RawMessage, required, optional []string) bool {
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, key := range required {
		allowed[key] = struct{}{}
		if _, ok := object[key]; !ok {
			return false
		}
	}
	for _, key := range optional {
		allowed[key] = struct{}{}
	}
	for key := range object {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}

func rawString(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func rawBool(raw json.RawMessage) (bool, bool) {
	var value bool
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return false, false
	}
	return value, true
}

func rawInt(raw json.RawMessage) (int, bool) {
	var value int
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return 0, false
	}
	return value, true
}

func validIdentifier(value string) bool { return value != "" }

func validProfile(profile *definitionProfile) bool {
	if profile == nil || profile.SafeArea == nil || !validIdentifier(profile.ID) || !validIdentifier(profile.Name) || profile.Width < 320 || profile.Width > 7680 || profile.Height < 320 || profile.Height > 7680 {
		return false
	}
	if profile.InteractionMode != "touch" && profile.InteractionMode != "non-touch" {
		return false
	}
	if profile.ViewingDistance != "near" && profile.ViewingDistance != "standing" && profile.ViewingDistance != "far" {
		return false
	}
	sa := profile.SafeArea
	return sa.Top >= 0 && sa.Right >= 0 && sa.Bottom >= 0 && sa.Left >= 0 && sa.Left+sa.Right < profile.Width && sa.Top+sa.Bottom < profile.Height
}

func validGrid(grid *definitionGrid) bool {
	return grid != nil && grid.Columns >= 1 && grid.Columns <= 48 && grid.Rows >= 1 && grid.Rows <= 48
}

func conditionExceedsNodeLimit(access json.RawMessage) bool {
	object, ok := decodeRawObject(access)
	if !ok {
		return false
	}
	when, ok := object["when"]
	if !ok || !rawJSONObject(when) {
		return false
	}
	stack := []json.RawMessage{when}
	nodes := 0
	for len(stack) > 0 {
		node := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		nodes++
		if nodes > maxConditionNodes {
			return true
		}
		nodeObject, ok := decodeRawObject(node)
		if !ok {
			continue
		}
		kind, _ := rawString(nodeObject["kind"])
		if kind != "group" {
			continue
		}
		var children []json.RawMessage
		if json.Unmarshal(nodeObject["children"], &children) != nil {
			continue
		}
		for index := len(children) - 1; index >= 0; index-- {
			stack = append(stack, children[index])
		}
	}
	return false
}

func preflightResourceBounds(definition definitionEnvelope, issues *issueCollector) bool {
	exceeded := false
	if len(definition.Variants) > maxDefinitionVariants {
		issues.add(CodeSchemaInvalid, "variants")
		exceeded = true
	}
	if len(definition.Pages) > maxDefinitionPages {
		issues.add(CodeSchemaInvalid, "pages")
		return true
	}
	for pageIndex, page := range definition.Pages {
		if len(page.Widgets) > maxWidgetsPerPage {
			issues.add(CodeSchemaInvalid, "pages.widgets")
			exceeded = true
			continue
		}
		if conditionExceedsNodeLimit(page.Access) {
			issues.add(CodeSchemaInvalid, "pages.access.when")
			return true
		}
		for _, layout := range page.Layouts {
			if len(layout.Placements) > maxDefinitionPlacements {
				issues.add(CodeSchemaInvalid, "pages.layouts.placements")
				return true
			}
		}
		for widgetIndex, widget := range page.Widgets {
			if len(widget.Actions) != 0 {
				var actions []json.RawMessage
				if json.Unmarshal(widget.Actions, &actions) == nil && len(actions) > maxActionsPerWidget {
					issues.add(CodeSchemaInvalid, "pages.widgets.actions")
					exceeded = true
				}
			}
			if conditionExceedsNodeLimit(widget.Access) {
				_ = pageIndex
				_ = widgetIndex
				issues.add(CodeSchemaInvalid, "pages.widgets.access.when")
				return true
			}
		}
	}
	return exceeded
}

func validTone(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	value, ok := rawString(raw)
	if !ok {
		return false
	}
	return value == "default" || value == "emphasized" || value == "restricted" || value == "destructive"
}

func validTypographyScale(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var value float64
	return json.Unmarshal(raw, &value) == nil && value >= 0.75 && value <= 2
}

func validTheme(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	object, ok := decodeRawObject(raw)
	if !ok || !hasObjectShape(object, []string{"preset", "tokens"}, nil) {
		return false
	}
	preset, ok := rawString(object["preset"])
	if !ok || preset != "legacy-kiosk" {
		return false
	}
	tokens, ok := decodeRawObject(object["tokens"])
	if !ok || !hasObjectShape(tokens, []string{"header", "surface", "serviceGrid"}, nil) {
		return false
	}
	for _, key := range []string{"header", "surface", "serviceGrid"} {
		value, ok := rawString(tokens[key])
		if !ok || !hexColorPattern.MatchString(value) {
			return false
		}
	}
	return true
}

func parseFlowPages(raw json.RawMessage) (map[string]string, bool) {
	if len(raw) == 0 {
		return map[string]string{}, true
	}
	object, ok := decodeRawObject(raw)
	if !ok {
		return nil, false
	}
	flowPages := make(map[string]string, len(object))
	for role, rawPageID := range object {
		if _, ok := allowedFlowRoles[role]; !ok {
			return nil, false
		}
		pageID, ok := rawString(rawPageID)
		if !ok || !validIdentifier(pageID) {
			return nil, false
		}
		flowPages[role] = pageID
	}
	return flowPages, true
}

func validateAccess(raw json.RawMessage, pagePolicy bool) bool {
	if len(raw) == 0 {
		return true
	}
	object, ok := decodeRawObject(raw)
	if !ok || !hasObjectShape(object, []string{"when", "whenFalse"}, nil) {
		return false
	}
	whenFalse, ok := rawString(object["whenFalse"])
	if !ok || (pagePolicy && whenFalse != "hide") || (!pagePolicy && whenFalse != "hide" && whenFalse != "lock") {
		return false
	}
	return validateConditionNode(object["when"])
}

func validateConditionNode(root json.RawMessage) bool {
	stack := []json.RawMessage{root}
	nodes := 0
	for len(stack) > 0 {
		node := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		nodes++
		if nodes > maxConditionNodes {
			return false
		}
		object, ok := decodeRawObject(node)
		if !ok {
			return false
		}
		kind, ok := rawString(object["kind"])
		if !ok {
			return false
		}
		switch kind {
		case "group":
			if !hasObjectShape(object, []string{"kind", "combinator", "children"}, nil) {
				return false
			}
			combinator, ok := rawString(object["combinator"])
			if !ok || (combinator != "and" && combinator != "or") {
				return false
			}
			var children []json.RawMessage
			if json.Unmarshal(object["children"], &children) != nil || len(children) == 0 {
				return false
			}
			for index := len(children) - 1; index >= 0; index-- {
				stack = append(stack, children[index])
			}
		case "rule":
			field, fieldOK := rawString(object["field"])
			operator, operatorOK := rawString(object["operator"])
			if !fieldOK || !operatorOK {
				return false
			}
			switch field {
			case "identity.isAuthenticated", "identity.isEmployee", "live.isOpen", "live.isConnected":
				if !hasObjectShape(object, []string{"kind", "field", "operator"}, nil) || (operator != "is-true" && operator != "is-false") {
					return false
				}
			case "identity.groups":
				value, valueOK := rawString(object["value"])
				if !hasObjectShape(object, []string{"kind", "field", "operator", "value"}, nil) || !valueOK || value == "" || (operator != "contains" && operator != "not-contains") {
					return false
				}
			case "live.queueLength":
				var value float64
				if !hasObjectShape(object, []string{"kind", "field", "operator", "value"}, nil) || json.Unmarshal(object["value"], &value) != nil || (operator != "eq" && operator != "ne" && operator != "gt" && operator != "gte" && operator != "lt" && operator != "lte") {
					return false
				}
			case "session.selectedServiceId":
				value, valueOK := rawString(object["value"])
				if !hasObjectShape(object, []string{"kind", "field", "operator", "value"}, nil) || !valueOK || value == "" || (operator != "eq" && operator != "ne") {
					return false
				}
			default:
				return false
			}
		default:
			return false
		}
	}
	return true
}

func parseActions(raw json.RawMessage) ([]definitionAction, bool) {
	if len(raw) == 0 {
		return []definitionAction{}, true
	}
	var rawActions []json.RawMessage
	if json.Unmarshal(raw, &rawActions) != nil || rawActions == nil || len(rawActions) > maxActionsPerWidget {
		return nil, false
	}
	actions := make([]definitionAction, 0, len(rawActions))
	for _, rawAction := range rawActions {
		object, ok := decodeRawObject(rawAction)
		if !ok {
			return nil, false
		}
		actionType, ok := rawString(object["type"])
		if !ok {
			return nil, false
		}
		action := definitionAction{Type: actionType}
		switch actionType {
		case "navigate":
			target, ok := rawString(object["toPageId"])
			if !ok || !validIdentifier(target) {
				return nil, false
			}
			action.ToPageID = target
		case "submit-ticket", "print-ticket", "reset-session":
		case "set-session":
			key, keyOK := rawString(object["key"])
			valueObject, valueOK := decodeRawObject(object["value"])
			if !keyOK || (key != "selectedServiceId" && key != "selectedCategoryId" && key != "activeLocale") || !valueOK {
				return nil, false
			}
			source, sourceOK := rawString(valueObject["source"])
			switch source {
			case "literal":
				_, valueOK = rawString(valueObject["value"])
			case "event":
				field, fieldOK := rawString(valueObject["field"])
				valueOK = fieldOK && (field == "serviceId" || field == "categoryId" || field == "locale")
			default:
				valueOK = false
			}
			if !sourceOK || !valueOK {
				return nil, false
			}
		default:
			return nil, false
		}
		actions = append(actions, action)
	}
	return actions, true
}

func parseLegacyRouting(widget definitionWidget) (*legacyRouting, bool) {
	config, ok := decodeRawObject(widget.Config)
	if !ok {
		return nil, false
	}
	rawRouting, exists := config["legacyRouting"]
	if !exists {
		return nil, true
	}
	if widget.Type != "service-picker" {
		return nil, false
	}
	routingObject, ok := decodeRawObject(rawRouting)
	if !ok || !hasObjectShape(routingObject, []string{"source", "canonicalSlots", "routes"}, nil) {
		return nil, false
	}
	source, ok := rawString(routingObject["source"])
	if !ok || source != "legacy-service-routes" {
		return nil, false
	}
	var canonicalSlots []string
	if json.Unmarshal(routingObject["canonicalSlots"], &canonicalSlots) != nil || len(canonicalSlots) != len(legacyRouteSlots) {
		return nil, false
	}
	for index, slot := range legacyRouteSlots {
		if canonicalSlots[index] != slot {
			return nil, false
		}
	}
	var rawRoutes []json.RawMessage
	if json.Unmarshal(routingObject["routes"], &rawRoutes) != nil || rawRoutes == nil {
		return nil, false
	}
	routing := &legacyRouting{Routes: make([]legacyServiceRoute, 0, len(rawRoutes))}
	serviceIDs := make(map[string]struct{}, len(rawRoutes))
	for _, rawRoute := range rawRoutes {
		routeObject, ok := decodeRawObject(rawRoute)
		if !ok || !hasObjectShape(routeObject, []string{"serviceId", "identificationMode", "slots", "terminalActions"}, nil) {
			return nil, false
		}
		serviceID, serviceOK := rawString(routeObject["serviceId"])
		identificationMode, modeOK := rawString(routeObject["identificationMode"])
		if !serviceOK || serviceID == "" || !modeOK || !validIdentificationMode(identificationMode) {
			return nil, false
		}
		if _, duplicate := serviceIDs[serviceID]; duplicate {
			return nil, false
		}
		serviceIDs[serviceID] = struct{}{}
		var slots []string
		if json.Unmarshal(routeObject["slots"], &slots) != nil || len(slots) == 0 {
			return nil, false
		}
		previousSlot := -1
		hasIdentity := false
		for _, slot := range slots {
			canonicalIndex := -1
			for index, canonical := range legacyRouteSlots {
				if slot == canonical {
					canonicalIndex = index
					break
				}
			}
			if canonicalIndex <= previousSlot {
				return nil, false
			}
			previousSlot = canonicalIndex
			hasIdentity = hasIdentity || slot == "identity"
		}
		if slots[len(slots)-1] != "success" || (identificationMode != "none" && !hasIdentity) {
			return nil, false
		}
		var terminalActions []json.RawMessage
		if json.Unmarshal(routeObject["terminalActions"], &terminalActions) != nil || len(terminalActions) != 1 {
			return nil, false
		}
		terminalObject, ok := decodeRawObject(terminalActions[0])
		if !ok || !hasObjectShape(terminalObject, []string{"type"}, nil) {
			return nil, false
		}
		terminalAction, ok := rawString(terminalObject["type"])
		if !ok || (terminalAction != "submit-ticket" && terminalAction != "redeem-pre-registration") || (identificationMode == "qr" && terminalAction != "redeem-pre-registration") || (identificationMode != "qr" && terminalAction != "submit-ticket") {
			return nil, false
		}
		routing.Routes = append(routing.Routes, legacyServiceRoute{ServiceID: serviceID, IdentificationMode: identificationMode, Slots: slots, TerminalAction: terminalAction})
	}
	return routing, true
}

func validIdentificationMode(value string) bool {
	switch value {
	case "none", "phone", "qr", "document", "custom", "login", "badge":
		return true
	default:
		return false
	}
}

func widgetSupportsSurface(surface string, widget definitionWidget, actions []definitionAction) bool {
	if widget.Type == "custom-html" {
		return surface == SurfaceQueueDisplay || surface == SurfaceCounterDisplay
	}
	if surface == SurfaceQueueDisplay || surface == SurfaceCounterDisplay {
		if _, blocked := displayBlockedWidgetTypes[widget.Type]; blocked {
			return false
		}
		for _, action := range actions {
			if action.Type == "submit-ticket" || action.Type == "print-ticket" || action.Type == "set-session" || action.Type == "reset-session" {
				return false
			}
		}
		return true
	}
	if surface == SurfaceVisitorMobile {
		if _, ok := visitorMobileWidgetTypes[widget.Type]; !ok {
			return false
		}
		for _, action := range actions {
			if action.Type == "print-ticket" {
				return false
			}
		}
		return true
	}
	return surface == SurfaceTicketStation
}

func overlaps(left, right definitionPlacement) bool {
	return left.Col < right.Col+right.ColSpan && right.Col < left.Col+left.ColSpan && left.Row < right.Row+right.RowSpan && right.Row < left.Row+left.RowSpan
}

func runtimeAttractPage(surface string, page definitionPage) bool {
	if surface != SurfaceTicketStation || page.ID != "attract" || page.Name != "Attract" || len(page.Access) != 0 || len(page.Widgets) != 1 {
		return false
	}
	widget := page.Widgets[0]
	if widget.ID != "attract-media" || widget.Type != "media" || len(widget.Tone) != 0 || len(widget.Access) != 0 {
		return false
	}
	actions, valid := parseActions(widget.Actions)
	if !valid || len(actions) != 0 {
		return false
	}
	config, ok := decodeRawObject(widget.Config)
	if !ok || !hasObjectShape(config, []string{"source", "compatibility"}, nil) {
		return false
	}
	source, ok := rawString(config["source"])
	if !ok || source != "legacy-kiosk-attract" {
		return false
	}
	compatibility, ok := decodeRawObject(config["compatibility"])
	if !ok || !hasObjectShape(compatibility, []string{"mode", "sessionIdleBeforeWarningSec", "sessionIdleCountdownSec", "showAttractAfterSessionEnd", "attractIdleSec", "showQueueDepthOnAttract", "signage"}, nil) {
		return false
	}
	mode, modeOK := rawString(compatibility["mode"])
	beforeWarning, beforeOK := rawInt(compatibility["sessionIdleBeforeWarningSec"])
	countdown, countdownOK := rawInt(compatibility["sessionIdleCountdownSec"])
	attractIdle, attractOK := rawInt(compatibility["attractIdleSec"])
	_, showAfterOK := rawBool(compatibility["showAttractAfterSessionEnd"])
	_, queueDepthOK := rawBool(compatibility["showQueueDepthOnAttract"])
	if !modeOK || (mode != "session_then_attract" && mode != "attract_only" && mode != "off") || mode == "off" || !beforeOK || beforeWarning < 1 || beforeWarning > 3600 || !countdownOK || countdown < 1 || countdown > 300 || !attractOK || attractIdle < 10 || attractIdle > 600 || !showAfterOK || !queueDepthOK {
		return false
	}
	signage, ok := decodeRawObject(compatibility["signage"])
	if !ok || !hasObjectShape(signage, []string{"mode"}, []string{"playlistId", "materialIds", "slideDurationSec"}) {
		return false
	}
	signageMode, ok := rawString(signage["mode"])
	if !ok || (signageMode != "inherit" && signageMode != "playlist" && signageMode != "materials") {
		return false
	}
	if raw, exists := signage["playlistId"]; exists {
		if _, ok := rawString(raw); !ok {
			return false
		}
	}
	if raw, exists := signage["materialIds"]; exists {
		var values []string
		if json.Unmarshal(raw, &values) != nil || values == nil {
			return false
		}
	}
	if raw, exists := signage["slideDurationSec"]; exists {
		value, ok := rawInt(raw)
		if !ok || value < 1 || value > 300 {
			return false
		}
	}
	return true
}

func requiredFlowRole(widget definitionWidget) string {
	switch widget.Type {
	case "service-picker":
		return "serviceCatalogPageId"
	case "ticket-form":
		config, _ := decodeRawObject(widget.Config)
		mode, _ := rawString(config["mode"])
		if mode == "appointment-checkin" {
			return "appointmentPageId"
		}
		return "serviceFormPageId"
	case "identify":
		return "identityPageId"
	case "ticket-success":
		return "successPageId"
	case "rich-info":
		config, _ := decodeRawObject(widget.Config)
		slot, _ := rawString(config["slot"])
		return flowPageForSlot[slot]
	default:
		return ""
	}
}

func servicePickerScrollRequired(configRaw json.RawMessage) bool {
	config, ok := decodeRawObject(configRaw)
	if !ok {
		return false
	}
	presentation, ok := decodeRawObject(config["presentation"])
	if !ok {
		return false
	}
	mode, ok := rawString(presentation["mode"])
	if !ok {
		return false
	}
	grid, ok := decodeRawObject(presentation["grid"])
	if !ok || !hasObjectShape(grid, []string{"rows", "columns"}, nil) {
		return false
	}
	rows, rowsOK := rawInt(grid["rows"])
	columns, columnsOK := rawInt(grid["columns"])
	if !rowsOK || !columnsOK || rows < 1 || rows > 48 || columns < 1 || columns > 48 {
		return false
	}

	var pagination map[string]json.RawMessage
	if raw, exists := config["pagination"]; exists {
		pagination, ok = decodeRawObject(raw)
		if !ok || !hasObjectShape(pagination, []string{"enabled"}, []string{"pageSize", "threshold"}) {
			return false
		}
		if _, ok := rawBool(pagination["enabled"]); !ok {
			return false
		}
		for _, key := range []string{"pageSize", "threshold"} {
			if rawValue, exists := pagination[key]; exists {
				value, ok := rawInt(rawValue)
				if !ok || value < 1 {
					return false
				}
			}
		}
	}

	var catalog map[string]json.RawMessage
	if raw, exists := config["catalog"]; exists {
		catalog, ok = decodeRawObject(raw)
		if !ok || !hasObjectShape(catalog, []string{"navigation"}, []string{"rootCategoryIds", "itemCount"}) {
			return false
		}
		navigation, ok := rawString(catalog["navigation"])
		if !ok || (navigation != "flat" && navigation != "categories") {
			return false
		}
		if rawValue, exists := catalog["rootCategoryIds"]; exists {
			var values []string
			if json.Unmarshal(rawValue, &values) != nil || values == nil {
				return false
			}
		}
		if rawValue, exists := catalog["itemCount"]; exists {
			value, ok := rawInt(rawValue)
			if !ok || value < 0 {
				return false
			}
		}
	}

	capacity := rows * columns
	switch mode {
	case "manual":
		if !hasObjectShape(presentation, []string{"mode", "grid", "coordinateBase", "placements"}, nil) {
			return false
		}
		coordinateBase, ok := rawString(presentation["coordinateBase"])
		if !ok || (coordinateBase != "zero-based" && coordinateBase != "one-based") {
			return false
		}
		var rawPlacements []json.RawMessage
		if json.Unmarshal(presentation["placements"], &rawPlacements) != nil || rawPlacements == nil {
			return false
		}
		minimum := 0
		if coordinateBase == "one-based" {
			minimum = 1
		}
		for _, rawPlacement := range rawPlacements {
			placement, ok := decodeRawObject(rawPlacement)
			if !ok || !hasObjectShape(placement, []string{"serviceId", "row", "col", "rowSpan", "colSpan"}, nil) {
				return false
			}
			serviceID, serviceOK := rawString(placement["serviceId"])
			row, rowOK := rawInt(placement["row"])
			col, colOK := rawInt(placement["col"])
			rowSpan, rowSpanOK := rawInt(placement["rowSpan"])
			colSpan, colSpanOK := rawInt(placement["colSpan"])
			if !serviceOK || serviceID == "" || !rowOK || !colOK || !rowSpanOK || rowSpan < 1 || !colSpanOK || colSpan < 1 {
				return false
			}
			zeroRow := row - minimum
			zeroCol := col - minimum
			if zeroRow < 0 || zeroCol < 0 || zeroRow+rowSpan > rows || zeroCol+colSpan > columns {
				return true
			}
		}
		return false
	case "auto":
		if !hasObjectShape(presentation, []string{"mode", "grid"}, nil) {
			return false
		}
		if pagination != nil {
			enabled, _ := rawBool(pagination["enabled"])
			if enabled {
				pageSize, exists := pagination["pageSize"]
				if !exists {
					return true
				}
				value, _ := rawInt(pageSize)
				return value > capacity
			}
		}
		if catalog != nil {
			itemCountRaw, exists := catalog["itemCount"]
			if exists {
				itemCount, _ := rawInt(itemCountRaw)
				navigation, _ := rawString(catalog["navigation"])
				return itemCount > capacity && navigation != "categories"
			}
		}
		return false
	default:
		return false
	}
}

// ValidateDefinition validates a publishable definition using a hard byte cap,
// bounded collection sizes, iterative condition/graph traversal, and redacted errors.
func ValidateDefinition(raw json.RawMessage, expectedSurface string) (err error) {
	issues := newIssueCollector()
	defer func() {
		if recover() != nil {
			issues.add(CodeSchemaInvalid, "definition")
			err = issues.err()
		}
	}()
	if len(raw) == 0 || len(raw) > MaxDefinitionBytes || !rawJSONObject(raw) {
		issues.add(CodeSchemaInvalid, "definition")
		return issues.err()
	}

	var definition definitionEnvelope
	if json.Unmarshal(raw, &definition) != nil {
		issues.add(CodeSchemaInvalid, "definition")
		return issues.err()
	}
	if preflightResourceBounds(definition, issues) {
		return issues.err()
	}

	structuralValid := true
	markSchema := func(path string) {
		structuralValid = false
		issues.add(CodeSchemaInvalid, path)
	}
	if definition.SchemaVersion != 1 || !validIdentifier(definition.ID) {
		markSchema("schema")
	}
	if _, ok := allowedSurfaces[definition.Surface]; !ok || definition.Surface != expectedSurface {
		markSchema("surface")
	}
	if len(definition.Variants) < 1 {
		markSchema("variants")
	}
	if len(definition.Pages) < 1 {
		markSchema("pages")
	}
	if !validTheme(definition.Theme) {
		markSchema("theme")
	}
	flowPages, flowValid := parseFlowPages(definition.FlowPages)
	if !flowValid {
		markSchema("flowPages")
		flowPages = map[string]string{}
	}

	variantByID := make(map[string]definitionVariant, len(definition.Variants))
	for _, variant := range definition.Variants {
		if !validIdentifier(variant.ID) || !validProfile(variant.Profile) || !validGrid(variant.Grid) {
			markSchema("variants")
		}
		if _, duplicate := variantByID[variant.ID]; duplicate {
			markSchema("variants.id")
		}
		variantByID[variant.ID] = variant
	}

	pageIndexByID := make(map[string]int, len(definition.Pages))
	for pageIndex, page := range definition.Pages {
		if !validIdentifier(page.ID) || !validIdentifier(page.Name) || page.Widgets == nil || page.Layouts == nil {
			markSchema("pages")
		}
		if !validateAccess(page.Access, true) {
			structuralValid = false
			issues.add(CodeConditionInvalid, "pages.access.when")
		}
		if _, duplicate := pageIndexByID[page.ID]; duplicate {
			markSchema("pages.id")
		}
		pageIndexByID[page.ID] = pageIndex
	}
	if _, exists := pageIndexByID[definition.StartPageID]; !exists || !validIdentifier(definition.StartPageID) {
		structuralValid = false
		issues.add(CodePageStartMissing, "startPageId")
	}
	for _, pageID := range flowPages {
		if _, exists := pageIndexByID[pageID]; !exists {
			structuralValid = false
			issues.add(CodeFlowRequiredPageMissing, "flowPages")
		}
	}

	actionsByWidget := make([][][]definitionAction, len(definition.Pages))
	for pageIndex, page := range definition.Pages {
		actionsByWidget[pageIndex] = make([][]definitionAction, len(page.Widgets))
		widgetIDs := make(map[string]struct{}, len(page.Widgets))
		for widgetIndex, widget := range page.Widgets {
			if !validIdentifier(widget.ID) || !rawJSONObject(widget.Config) {
				markSchema("pages.widgets")
			}
			if _, ok := allowedWidgetTypes[widget.Type]; !ok {
				markSchema("pages.widgets.type")
			}
			if !validTone(widget.Tone) {
				markSchema("pages.widgets.tone")
			}
			if !validateAccess(widget.Access, false) {
				structuralValid = false
				issues.add(CodeConditionInvalid, "pages.widgets.access.when")
			}
			if _, duplicate := widgetIDs[widget.ID]; duplicate {
				markSchema("pages.widgets.id")
			}
			widgetIDs[widget.ID] = struct{}{}
			actions, valid := parseActions(widget.Actions)
			if !valid {
				markSchema("pages.widgets.actions")
				actions = []definitionAction{}
			}
			actionsByWidget[pageIndex][widgetIndex] = actions
			for _, action := range actions {
				if action.Type == "navigate" {
					if _, exists := pageIndexByID[action.ToPageID]; !exists {
						structuralValid = false
						issues.add(CodeActionTargetMissing, "pages.widgets.actions.toPageId")
					}
				}
			}
			if !widgetSupportsSurface(definition.Surface, widget, actions) {
				issues.add(CodeWidgetUnsupportedForSurface, "pages.widgets")
			}
		}

		for variantID, layout := range page.Layouts {
			variant, exists := variantByID[variantID]
			if !exists || !validIdentifier(variantID) {
				markSchema("pages.layouts")
				continue
			}
			if layout.Placements == nil || !validTypographyScale(layout.TypographyScale) {
				markSchema("pages.layouts")
				continue
			}
			placementIDs := make([]string, 0, len(layout.Placements))
			placementsValid := true
			for widgetID, placement := range layout.Placements {
				placementIDs = append(placementIDs, widgetID)
				if !validIdentifier(widgetID) {
					placementsValid = false
					markSchema("pages.layouts.placements")
				}
				if _, exists := widgetIDs[widgetID]; !exists || placement.Col < 1 || placement.Row < 1 || placement.ColSpan < 1 || placement.RowSpan < 1 {
					placementsValid = false
					markSchema("pages.layouts.placements")
					continue
				}
				if placement.Col+placement.ColSpan-1 > variant.Grid.Columns || placement.Row+placement.RowSpan-1 > variant.Grid.Rows {
					structuralValid = false
					issues.add(CodeVariantPlacementOverflow, "pages.layouts.placements")
				}
			}
			if placementsValid {
				sort.Strings(placementIDs)
				for leftIndex := 0; leftIndex < len(placementIDs); leftIndex++ {
					for rightIndex := leftIndex + 1; rightIndex < len(placementIDs); rightIndex++ {
						if overlaps(layout.Placements[placementIDs[leftIndex]], layout.Placements[placementIDs[rightIndex]]) {
							structuralValid = false
							issues.add(CodeVariantPlacementOverlap, "pages.layouts.placements")
						}
					}
				}
			}
		}
		for variantID := range variantByID {
			layout, exists := page.Layouts[variantID]
			if !exists {
				structuralValid = false
				issues.add(CodeVariantUnplacedWidget, "pages.layouts")
				continue
			}
			for widgetID := range widgetIDs {
				if _, exists := layout.Placements[widgetID]; !exists {
					structuralValid = false
					issues.add(CodeVariantUnplacedWidget, "pages.layouts.placements")
				}
			}
		}
	}

	if !structuralValid {
		return issues.err()
	}

	adjacency := make(map[string][]string, len(definition.Pages))
	legacyByPage := make(map[int][]legacyRouting)
	requiredFlowRoles := make(map[string]struct{})
	for pageIndex, page := range definition.Pages {
		for widgetIndex, widget := range page.Widgets {
			for _, action := range actionsByWidget[pageIndex][widgetIndex] {
				if action.Type == "navigate" {
					adjacency[page.ID] = append(adjacency[page.ID], action.ToPageID)
				}
			}
			if role := requiredFlowRole(widget); role != "" {
				requiredFlowRoles[role] = struct{}{}
			}
			routing, valid := parseLegacyRouting(widget)
			if !valid {
				issues.add(CodeSchemaInvalid, "pages.widgets.config.legacyRouting")
				continue
			}
			if routing != nil {
				legacyByPage[pageIndex] = append(legacyByPage[pageIndex], *routing)
				for _, route := range routing.Routes {
					for _, slot := range route.Slots {
						requiredFlowRoles[flowPageForSlot[slot]] = struct{}{}
					}
				}
			}
		}
	}
	for role := range requiredFlowRoles {
		if _, exists := flowPages[role]; !exists {
			issues.add(CodeFlowRequiredPageMissing, "flowPages")
		}
	}
	for pageIndex, routings := range legacyByPage {
		for _, routing := range routings {
			for _, route := range routing.Routes {
				previousPageID := definition.Pages[pageIndex].ID
				for _, slot := range route.Slots {
					targetPageID, exists := flowPages[flowPageForSlot[slot]]
					if !exists {
						continue
					}
					adjacency[previousPageID] = append(adjacency[previousPageID], targetPageID)
					previousPageID = targetPageID
				}
			}
		}
	}

	reachable := make(map[string]struct{}, len(definition.Pages))
	for _, page := range definition.Pages {
		if runtimeAttractPage(definition.Surface, page) {
			reachable[page.ID] = struct{}{}
		}
	}
	queue := []string{definition.StartPageID}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if _, seen := reachable[current]; seen {
			continue
		}
		reachable[current] = struct{}{}
		for _, target := range adjacency[current] {
			if _, seen := reachable[target]; !seen {
				queue = append(queue, target)
			}
		}
	}
	for _, page := range definition.Pages {
		if _, ok := reachable[page.ID]; !ok {
			issues.add(CodePageUnreachable, "pages")
		}
	}

	for pageIndex, page := range definition.Pages {
		for _, variant := range definition.Variants {
			layout := page.Layouts[variant.ID]
			availableWidth := variant.Profile.Width - variant.Profile.SafeArea.Left - variant.Profile.SafeArea.Right
			availableHeight := variant.Profile.Height - variant.Profile.SafeArea.Top - variant.Profile.SafeArea.Bottom
			for widgetIndex, widget := range page.Widgets {
				if variant.Profile.InteractionMode != "touch" {
					continue
				}
				_, typeInteractive := interactiveWidgetTypes[widget.Type]
				if !typeInteractive && len(actionsByWidget[pageIndex][widgetIndex]) == 0 {
					continue
				}
				placement := layout.Placements[widget.ID]
				width := int(math.Floor((float64(availableWidth) / float64(variant.Grid.Columns)) * float64(placement.ColSpan)))
				height := int(math.Floor((float64(availableHeight) / float64(variant.Grid.Rows)) * float64(placement.RowSpan)))
				if width < minimumTouchTargetPX || height < minimumTouchTargetPX {
					issues.add(CodeTouchTargetTooSmall, "pages.layouts.placements")
				}
			}
		}
		if definition.Surface == SurfaceTicketStation {
			for _, widget := range page.Widgets {
				if widget.Type == "service-picker" && servicePickerScrollRequired(widget.Config) {
					issues.add(CodeStationPageScrollRequired, "pages.widgets.config")
				}
			}
		}
	}
	return issues.err()
}

// HasVariant performs only bounded envelope decoding. Callers assigning a
// published definition must call ValidateDefinition first.
func HasVariant(raw json.RawMessage, variantID string) (matched bool, err error) {
	defer func() {
		if recover() != nil {
			matched = false
			err = &ValidationError{Issues: []ValidationIssue{{Code: CodeSchemaInvalid, Path: "definition"}}}
		}
	}()
	if len(raw) == 0 || len(raw) > MaxDefinitionBytes || !rawJSONObject(raw) || !validIdentifier(variantID) {
		return false, &ValidationError{Issues: []ValidationIssue{{Code: CodeSchemaInvalid, Path: "definition"}}}
	}
	var envelope struct {
		Variants []struct {
			ID string `json:"id"`
		} `json:"variants"`
	}
	if json.Unmarshal(raw, &envelope) != nil || len(envelope.Variants) < 1 || len(envelope.Variants) > maxDefinitionVariants {
		return false, &ValidationError{Issues: []ValidationIssue{{Code: CodeSchemaInvalid, Path: "variants"}}}
	}
	for _, variant := range envelope.Variants {
		if variant.ID == variantID {
			return true, nil
		}
	}
	return false, nil
}
