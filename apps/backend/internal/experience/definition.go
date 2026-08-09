// Package experience validates the bounded JSON envelope stored by published experience versions.
package experience

import (
	"bytes"
	"encoding/json"
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

	MaxDefinitionBytes      = 1 << 20
	maxDefinitionPages      = 100
	maxWidgetsPerPage       = 200
	maxActionsPerWidget     = 20
	maxDefinitionIssues     = 200
	maxDefinitionPlacements = 200
	maxDefinitionFlowPages  = 7
	maxLegacyRoutes         = 200
	maxIdentifierBytes      = 512
)

var legacyRouteSlots = []string{"service-info", "service-form", "identity", "confirmation", "success"}

var flowPageForLegacySlot = map[string]string{
	"service-info": "serviceInfoPageId",
	"service-form": "serviceFormPageId",
	"identity":     "identityPageId",
	"confirmation": "confirmationPageId",
	"success":      "successPageId",
}

var allowedSurfaces = map[string]struct{}{
	SurfaceTicketStation:  {},
	SurfaceQueueDisplay:   {},
	SurfaceCounterDisplay: {},
	SurfaceVisitorMobile:  {},
}

var allowedWidgetTypes = map[string]struct{}{
	"called-tickets": {}, "content-player": {}, "queue-stats": {}, "eta-display": {},
	"announcements": {}, "rss-feed": {}, "weather": {}, "clock": {}, "queue-ticker": {},
	"custom-html": {}, "screen-header": {}, "screen-footer-qr": {}, "join-queue-qr": {},
	"service-picker": {}, "rich-info": {}, "ticket-form": {}, "identify": {},
	"language-switch": {}, "ticket-success": {}, "media": {},
}

var displayBlockedWidgetTypes = map[string]struct{}{
	"service-picker": {}, "ticket-form": {}, "identify": {}, "ticket-success": {},
}

var visitorMobileWidgetTypes = map[string]struct{}{
	"service-picker": {}, "rich-info": {}, "ticket-form": {}, "language-switch": {},
	"ticket-success": {}, "media": {}, "eta-display": {}, "clock": {}, "join-queue-qr": {},
}

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
	FlowPages     map[string]string   `json:"flowPages"`
}

type definitionVariant struct {
	ID      string            `json:"id"`
	Profile definitionProfile `json:"profile"`
	Grid    definitionGrid    `json:"grid"`
}

type definitionProfile struct {
	ID              string             `json:"id"`
	Name            string             `json:"name"`
	Width           int                `json:"width"`
	Height          int                `json:"height"`
	InteractionMode string             `json:"interactionMode"`
	ViewingDistance string             `json:"viewingDistance"`
	SafeArea        definitionSafeArea `json:"safeArea"`
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
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Config  json.RawMessage   `json:"config"`
	Tone    *string           `json:"tone"`
	Access  json.RawMessage   `json:"access"`
	Actions []json.RawMessage `json:"actions"`
}

type definitionLayout struct {
	Placements map[string]definitionPlacement `json:"placements"`
}

type definitionPlacement struct {
	Col     int `json:"col"`
	Row     int `json:"row"`
	ColSpan int `json:"colSpan"`
	RowSpan int `json:"rowSpan"`
}

type definitionAction struct {
	Type     string          `json:"type"`
	ToPageID string          `json:"toPageId"`
	Key      string          `json:"key"`
	Value    json.RawMessage `json:"value"`
}

type legacyRouting struct {
	Source         string               `json:"source"`
	CanonicalSlots []string             `json:"canonicalSlots"`
	Routes         []legacyServiceRoute `json:"routes"`
}

type legacyServiceRoute struct {
	ServiceID          string                 `json:"serviceId"`
	IdentificationMode string                 `json:"identificationMode"`
	Slots              []string               `json:"slots"`
	TerminalActions    []legacyTerminalAction `json:"terminalActions"`
}

type legacyTerminalAction struct {
	Type string `json:"type"`
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

func validIdentifier(value string) bool {
	return value != "" && len(value) <= maxIdentifierBytes
}

func rawJSONObject(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) >= 2 && trimmed[0] == '{' && trimmed[len(trimmed)-1] == '}'
}

func validProfile(profile definitionProfile) bool {
	if !validIdentifier(profile.ID) || !validIdentifier(profile.Name) || profile.Width < 320 || profile.Width > 7680 || profile.Height < 320 || profile.Height > 7680 {
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

func validGrid(grid definitionGrid) bool {
	return grid.Columns >= 1 && grid.Columns <= 48 && grid.Rows >= 1 && grid.Rows <= 48
}

func withinResourceBounds(definition definitionEnvelope, issues *issueCollector) bool {
	bounded := true
	if len(definition.Variants) > 2 {
		issues.add(CodeSchemaInvalid, "variants")
		bounded = false
	}
	if len(definition.Pages) > maxDefinitionPages {
		issues.add(CodeSchemaInvalid, "pages")
		bounded = false
	}
	if len(definition.FlowPages) > maxDefinitionFlowPages {
		issues.add(CodeSchemaInvalid, "flowPages")
		bounded = false
	}
	if !bounded {
		return false
	}
	for _, page := range definition.Pages {
		if len(page.Widgets) > maxWidgetsPerPage || len(page.Layouts) > 2 {
			issues.add(CodeSchemaInvalid, "pages")
			bounded = false
			continue
		}
		for _, widget := range page.Widgets {
			if len(widget.Actions) > maxActionsPerWidget {
				issues.add(CodeSchemaInvalid, "pages.widgets.actions")
				bounded = false
			}
		}
		for _, layout := range page.Layouts {
			if len(layout.Placements) > maxDefinitionPlacements {
				issues.add(CodeSchemaInvalid, "pages.layouts.placements")
				bounded = false
			}
		}
	}
	return bounded
}

func parseAction(raw json.RawMessage) (definitionAction, bool) {
	var action definitionAction
	if !rawJSONObject(raw) || json.Unmarshal(raw, &action) != nil {
		return action, false
	}
	switch action.Type {
	case "navigate":
		return action, validIdentifier(action.ToPageID)
	case "submit-ticket", "print-ticket", "reset-session":
		return action, true
	case "set-session":
		if action.Key != "selectedServiceId" && action.Key != "selectedCategoryId" && action.Key != "activeLocale" {
			return action, false
		}
		var value struct {
			Source string  `json:"source"`
			Value  *string `json:"value"`
			Field  string  `json:"field"`
		}
		if !rawJSONObject(action.Value) || json.Unmarshal(action.Value, &value) != nil {
			return action, false
		}
		if value.Source == "literal" {
			return action, value.Value != nil
		}
		if value.Source == "event" {
			return action, value.Field == "serviceId" || value.Field == "categoryId" || value.Field == "locale"
		}
		return action, false
	default:
		return action, false
	}
}

func parseLegacyRouting(widget definitionWidget) (*legacyRouting, bool) {
	var config map[string]json.RawMessage
	if !rawJSONObject(widget.Config) || json.Unmarshal(widget.Config, &config) != nil {
		return nil, false
	}
	rawRouting, exists := config["legacyRouting"]
	if !exists {
		return nil, true
	}
	if widget.Type != "service-picker" || !rawJSONObject(rawRouting) {
		return nil, false
	}
	decoder := json.NewDecoder(bytes.NewReader(rawRouting))
	decoder.DisallowUnknownFields()
	var routing legacyRouting
	if decoder.Decode(&routing) != nil || routing.Source != "legacy-service-routes" || len(routing.CanonicalSlots) != len(legacyRouteSlots) || len(routing.Routes) > maxLegacyRoutes {
		return nil, false
	}
	for index, slot := range legacyRouteSlots {
		if routing.CanonicalSlots[index] != slot {
			return nil, false
		}
	}
	serviceIDs := make(map[string]struct{}, len(routing.Routes))
	for _, route := range routing.Routes {
		if !validIdentifier(route.ServiceID) || len(route.Slots) < 1 || len(route.Slots) > len(legacyRouteSlots) || len(route.TerminalActions) != 1 {
			return nil, false
		}
		if _, duplicate := serviceIDs[route.ServiceID]; duplicate {
			return nil, false
		}
		serviceIDs[route.ServiceID] = struct{}{}
		if route.IdentificationMode != "none" && route.IdentificationMode != "phone" && route.IdentificationMode != "qr" && route.IdentificationMode != "document" && route.IdentificationMode != "custom" && route.IdentificationMode != "login" && route.IdentificationMode != "badge" {
			return nil, false
		}
		previousSlot := -1
		hasIdentity := false
		for _, slot := range route.Slots {
			slotIndex := -1
			for index, canonicalSlot := range legacyRouteSlots {
				if slot == canonicalSlot {
					slotIndex = index
					break
				}
			}
			if slotIndex <= previousSlot {
				return nil, false
			}
			previousSlot = slotIndex
			hasIdentity = hasIdentity || slot == "identity"
		}
		if route.Slots[len(route.Slots)-1] != "success" || (route.IdentificationMode != "none" && !hasIdentity) {
			return nil, false
		}
		terminalAction := route.TerminalActions[0].Type
		if (route.IdentificationMode == "qr" && terminalAction != "redeem-pre-registration") || (route.IdentificationMode != "qr" && terminalAction != "submit-ticket") {
			return nil, false
		}
	}
	return &routing, true
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
	if widget.ID != "attract-media" || widget.Type != "media" || widget.Tone != nil || len(widget.Access) != 0 || len(widget.Actions) != 0 {
		return false
	}
	var config struct {
		Source        string `json:"source"`
		Compatibility struct {
			Mode                        string `json:"mode"`
			SessionIdleBeforeWarningSec int    `json:"sessionIdleBeforeWarningSec"`
			SessionIdleCountdownSec     int    `json:"sessionIdleCountdownSec"`
			ShowAttractAfterSessionEnd  *bool  `json:"showAttractAfterSessionEnd"`
			AttractIdleSec              int    `json:"attractIdleSec"`
			ShowQueueDepthOnAttract     *bool  `json:"showQueueDepthOnAttract"`
			Signage                     struct {
				Mode             string   `json:"mode"`
				PlaylistID       *string  `json:"playlistId"`
				MaterialIDs      []string `json:"materialIds"`
				SlideDurationSec *int     `json:"slideDurationSec"`
			} `json:"signage"`
		} `json:"compatibility"`
	}
	if !rawJSONObject(widget.Config) || json.Unmarshal(widget.Config, &config) != nil || config.Source != "legacy-kiosk-attract" {
		return false
	}
	c := config.Compatibility
	if c.Mode != "session_then_attract" && c.Mode != "attract_only" {
		return false
	}
	if c.SessionIdleBeforeWarningSec < 1 || c.SessionIdleBeforeWarningSec > 3600 || c.SessionIdleCountdownSec < 1 || c.SessionIdleCountdownSec > 300 || c.AttractIdleSec < 10 || c.AttractIdleSec > 600 || c.ShowAttractAfterSessionEnd == nil || c.ShowQueueDepthOnAttract == nil {
		return false
	}
	return c.Signage.Mode == "inherit" || c.Signage.Mode == "playlist" || c.Signage.Mode == "materials"
}

// ValidateDefinition validates a publishable definition using a hard byte cap,
// bounded collection sizes, iterative graph traversal, and redacted errors.
func ValidateDefinition(raw json.RawMessage, expectedSurface string) (err error) {
	deferredIssues := newIssueCollector()
	defer func() {
		if recover() != nil {
			deferredIssues.add(CodeSchemaInvalid, "definition")
			err = deferredIssues.err()
		}
	}()
	if len(raw) == 0 || len(raw) > MaxDefinitionBytes || !rawJSONObject(raw) {
		deferredIssues.add(CodeSchemaInvalid, "definition")
		return deferredIssues.err()
	}
	var definition definitionEnvelope
	if json.Unmarshal(raw, &definition) != nil {
		deferredIssues.add(CodeSchemaInvalid, "definition")
		return deferredIssues.err()
	}
	issues := deferredIssues
	if definition.SchemaVersion != 1 || !validIdentifier(definition.ID) {
		issues.add(CodeSchemaInvalid, "schema")
	}
	if _, ok := allowedSurfaces[definition.Surface]; !ok {
		issues.add(CodeSchemaInvalid, "surface")
	}
	if definition.Surface != expectedSurface {
		issues.add(CodeSchemaInvalid, "surface")
	}
	if len(definition.Variants) < 1 {
		issues.add(CodeSchemaInvalid, "variants")
	}
	if len(definition.Pages) < 1 {
		issues.add(CodeSchemaInvalid, "pages")
	}
	if !withinResourceBounds(definition, issues) {
		return issues.err()
	}

	variantByID := make(map[string]definitionVariant, len(definition.Variants))
	for _, variant := range definition.Variants {
		if !validIdentifier(variant.ID) || !validProfile(variant.Profile) || !validGrid(variant.Grid) {
			issues.add(CodeSchemaInvalid, "variants")
		}
		if _, duplicate := variantByID[variant.ID]; duplicate {
			issues.add(CodeSchemaInvalid, "variants.id")
		}
		variantByID[variant.ID] = variant
	}

	pageIndexByID := make(map[string]int, len(definition.Pages))
	for pageIndex, page := range definition.Pages {
		if !validIdentifier(page.ID) || !validIdentifier(page.Name) || page.Layouts == nil {
			issues.add(CodeSchemaInvalid, "pages")
		}
		if _, duplicate := pageIndexByID[page.ID]; duplicate {
			issues.add(CodeSchemaInvalid, "pages.id")
		}
		pageIndexByID[page.ID] = pageIndex
	}
	if _, exists := pageIndexByID[definition.StartPageID]; !exists || !validIdentifier(definition.StartPageID) {
		issues.add(CodePageStartMissing, "startPageId")
	}
	for role, pageID := range definition.FlowPages {
		if !validFlowRole(role) || !validIdentifier(pageID) {
			issues.add(CodeSchemaInvalid, "flowPages")
			continue
		}
		if _, exists := pageIndexByID[pageID]; !exists {
			issues.add(CodeFlowRequiredPageMissing, "flowPages")
		}
	}

	adjacency := make(map[string][]string, len(definition.Pages))
	for _, page := range definition.Pages {
		widgetIDs := make(map[string]struct{}, len(page.Widgets))
		for _, widget := range page.Widgets {
			if !validIdentifier(widget.ID) || !rawJSONObject(widget.Config) {
				issues.add(CodeSchemaInvalid, "pages.widgets")
			}
			if _, ok := allowedWidgetTypes[widget.Type]; !ok {
				issues.add(CodeSchemaInvalid, "pages.widgets.type")
			}
			if _, duplicate := widgetIDs[widget.ID]; duplicate {
				issues.add(CodeSchemaInvalid, "pages.widgets.id")
			}
			widgetIDs[widget.ID] = struct{}{}
			parsedActions := make([]definitionAction, 0, len(widget.Actions))
			for _, rawAction := range widget.Actions {
				action, valid := parseAction(rawAction)
				if !valid {
					issues.add(CodeSchemaInvalid, "pages.widgets.actions")
					continue
				}
				parsedActions = append(parsedActions, action)
				if action.Type == "navigate" {
					if _, exists := pageIndexByID[action.ToPageID]; !exists {
						issues.add(CodeActionTargetMissing, "pages.widgets.actions.toPageId")
					} else {
						adjacency[page.ID] = append(adjacency[page.ID], action.ToPageID)
					}
				}
			}
			if !widgetSupportsSurface(definition.Surface, widget, parsedActions) {
				issues.add(CodeWidgetUnsupportedForSurface, "pages.widgets")
			}
			routing, validRouting := parseLegacyRouting(widget)
			if !validRouting {
				issues.add(CodeSchemaInvalid, "pages.widgets.config.legacyRouting")
				continue
			}
			if routing != nil {
				for _, route := range routing.Routes {
					previousPageID := page.ID
					for _, slot := range route.Slots {
						flowRole := flowPageForLegacySlot[slot]
						targetPageID, exists := definition.FlowPages[flowRole]
						if !exists {
							issues.add(CodeFlowRequiredPageMissing, "flowPages")
							continue
						}
						if _, exists := pageIndexByID[targetPageID]; exists {
							adjacency[previousPageID] = append(adjacency[previousPageID], targetPageID)
							previousPageID = targetPageID
						}
					}
				}
			}
		}

		for variantID, layout := range page.Layouts {
			variant, exists := variantByID[variantID]
			if !exists {
				issues.add(CodeSchemaInvalid, "pages.layouts")
				continue
			}
			placementIDs := make([]string, 0, len(layout.Placements))
			for widgetID, placement := range layout.Placements {
				placementIDs = append(placementIDs, widgetID)
				if _, exists := widgetIDs[widgetID]; !exists || placement.Col < 1 || placement.Row < 1 || placement.ColSpan < 1 || placement.RowSpan < 1 {
					issues.add(CodeSchemaInvalid, "pages.layouts.placements")
					continue
				}
				if placement.Col+placement.ColSpan-1 > variant.Grid.Columns || placement.Row+placement.RowSpan-1 > variant.Grid.Rows {
					issues.add(CodeVariantPlacementOverflow, "pages.layouts.placements")
				}
			}
			sort.Strings(placementIDs)
			for i := 0; i < len(placementIDs); i++ {
				for j := i + 1; j < len(placementIDs); j++ {
					if overlaps(layout.Placements[placementIDs[i]], layout.Placements[placementIDs[j]]) {
						issues.add(CodeVariantPlacementOverlap, "pages.layouts.placements")
					}
				}
			}
		}
		for variantID := range variantByID {
			layout, exists := page.Layouts[variantID]
			if !exists {
				issues.add(CodeVariantUnplacedWidget, "pages.layouts")
				continue
			}
			for widgetID := range widgetIDs {
				if _, exists := layout.Placements[widgetID]; !exists {
					issues.add(CodeVariantUnplacedWidget, "pages.layouts.placements")
				}
			}
		}
	}

	if _, startExists := pageIndexByID[definition.StartPageID]; startExists {
		reachable := make(map[string]struct{}, len(definition.Pages))
		queue := []string{definition.StartPageID}
		for _, page := range definition.Pages {
			if runtimeAttractPage(definition.Surface, page) {
				reachable[page.ID] = struct{}{}
			}
		}
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
	}
	return issues.err()
}

func validFlowRole(role string) bool {
	switch role {
	case "serviceCatalogPageId", "serviceInfoPageId", "serviceFormPageId", "identityPageId", "appointmentPageId", "confirmationPageId", "successPageId":
		return true
	default:
		return false
	}
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
	if json.Unmarshal(raw, &envelope) != nil || len(envelope.Variants) < 1 || len(envelope.Variants) > 2 {
		return false, &ValidationError{Issues: []ValidationIssue{{Code: CodeSchemaInvalid, Path: "variants"}}}
	}
	for _, variant := range envelope.Variants {
		if variant.ID == variantID {
			return true, nil
		}
	}
	return false, nil
}
