package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/logger"
	"regexp"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrSurveyForbidden      = errors.New("forbidden")
	ErrSurveyNotFound       = errors.New("not found")
	ErrSurveyBadRequest     = errors.New("bad request")
	ErrSurveyFeatureLocked  = errors.New("feature not enabled for subscription")
	ErrSurveyIdleMediaInUse = errors.New("idle media still referenced by a survey")
)

type GuestSurveySession struct {
	CounterID             string                    `json:"counterId"`
	CounterName           string                    `json:"counterName"`
	UnitConfig            json.RawMessage           `json:"unitConfig,omitempty" swaggertype:"object"`
	ActiveTicket          *GuestSurveySessionTicket `json:"activeTicket,omitempty"`
	Survey                *GuestSurveySessionSurvey `json:"survey,omitempty"`
	ActiveSurveySubmitted bool                      `json:"activeSurveySubmitted"`
	// IdleScreen from the active survey for this counter (service zone scope first), regardless of ticket.
	IdleScreen json.RawMessage `json:"idleScreen,omitempty" swaggertype:"object"`
}

type GuestSurveySessionTicket struct {
	ID          string `json:"id"`
	QueueNumber string `json:"queueNumber"`
	Status      string `json:"status"`
}

// CounterBoardSessionTicket is the active ticket for counter-board displays (minimal fields; no survey payload).
type CounterBoardSessionTicket struct {
	ID          string `json:"id"`
	QueueNumber string `json:"queueNumber"`
	Status      string `json:"status"`
}

type GuestSurveySessionSurvey struct {
	ID                string          `json:"id"`
	Title             string          `json:"title"`
	Questions         json.RawMessage `json:"questions" swaggertype:"object"`
	CompletionMessage json.RawMessage `json:"completionMessage,omitempty" swaggertype:"object"`
	DisplayTheme      json.RawMessage `json:"displayTheme,omitempty" swaggertype:"object"`
}

// CounterBoardSession is for above-counter ticket displays only (counter_board terminals).
// It does not load survey definitions and does not require the guest survey subscription feature.
type CounterBoardSession struct {
	CounterID   string `json:"counterId"`
	CounterName string `json:"counterName"`
	// false when no operator has taken the counter
	CounterStaffed bool                       `json:"counterStaffed"`
	OnBreak        bool                       `json:"onBreak"`
	UnitConfig     json.RawMessage            `json:"unitConfig,omitempty" swaggertype:"object"`
	ActiveTicket   *CounterBoardSessionTicket `json:"activeTicket,omitempty"`
}

const maxCompletionMessagePerLocaleBytes = 64 * 1024
const maxDisplayThemeJSONBytes = 8 * 1024

// GuestSurveyIdleMediaCategory is the S3 tenant asset category for counter idle slide uploads.
const GuestSurveyIdleMediaCategory = "guest-survey-idle"

const (
	maxIdleScreenJSONBytes = 512 * 1024
	maxIdleSlides          = 30
	minSlideIntervalSec    = 1
	maxSlideIntervalSec    = 300
)

// surveyIdleImageFileRe matches idle image object names under guest-survey-idle (uuid + ext).
var surveyIdleImageFileRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|jpg|png|webp|svg)$`)

// surveyIdleVideoFileRe matches idle video object names.
var surveyIdleVideoFileRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|m4v)$`)

var surveyDisplayThemeHexRe = regexp.MustCompile(`(?i)^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$`)

func validateCompletionMessage(raw json.RawMessage) error {
	if len(raw) == 0 {
		return nil
	}
	if !json.Valid(raw) {
		return ErrSurveyBadRequest
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ErrSurveyBadRequest
	}
	for k, v := range obj {
		if k == "" {
			return ErrSurveyBadRequest
		}
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			return ErrSurveyBadRequest
		}
		if len(s) > maxCompletionMessagePerLocaleBytes {
			return ErrSurveyBadRequest
		}
	}
	return nil
}

func validateDisplayTheme(raw json.RawMessage) error {
	if len(raw) == 0 {
		return nil
	}
	if len(raw) > maxDisplayThemeJSONBytes {
		return ErrSurveyBadRequest
	}
	if !json.Valid(raw) {
		return ErrSurveyBadRequest
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ErrSurveyBadRequest
	}
	colorKeys := []string{
		"headerColor", "bodyColor", "foregroundColor", "mutedForegroundColor",
		"primaryColor", "primaryForegroundColor", "borderColor",
	}
	for _, k := range colorKeys {
		v, ok := obj[k]
		if !ok {
			continue
		}
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			return ErrSurveyBadRequest
		}
		if s != "" && !surveyDisplayThemeHexRe.MatchString(s) {
			return ErrSurveyBadRequest
		}
	}
	if v, ok := obj["isCustomColorsEnabled"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			return ErrSurveyBadRequest
		}
	}
	for k := range obj {
		switch k {
		case "isCustomColorsEnabled", "headerColor", "bodyColor", "foregroundColor",
			"mutedForegroundColor", "primaryColor", "primaryForegroundColor", "borderColor":
		default:
			return ErrSurveyBadRequest
		}
	}
	return nil
}

func validateIdleScreen(raw json.RawMessage, scopeUnitID string) error {
	if len(raw) == 0 {
		return nil
	}
	if len(raw) > maxIdleScreenJSONBytes {
		return ErrSurveyBadRequest
	}
	if !json.Valid(raw) {
		return ErrSurveyBadRequest
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var top struct {
		SlideIntervalSec int               `json:"slideIntervalSec"`
		Slides           []json.RawMessage `json:"slides"`
	}
	if err := dec.Decode(&top); err != nil {
		return ErrSurveyBadRequest
	}
	if len(top.Slides) > maxIdleSlides {
		return ErrSurveyBadRequest
	}
	if len(top.Slides) > 0 {
		if top.SlideIntervalSec < minSlideIntervalSec || top.SlideIntervalSec > maxSlideIntervalSec {
			return ErrSurveyBadRequest
		}
	} else if top.SlideIntervalSec != 0 &&
		(top.SlideIntervalSec < minSlideIntervalSec || top.SlideIntervalSec > maxSlideIntervalSec) {
		return ErrSurveyBadRequest
	}
	prefix := fmt.Sprintf("/api/units/%s/guest-survey/idle-media/", scopeUnitID)
	for _, slideRaw := range top.Slides {
		var head struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(slideRaw, &head); err != nil {
			return ErrSurveyBadRequest
		}
		switch strings.TrimSpace(head.Type) {
		case "text":
			if err := validateIdleTextSlide(slideRaw); err != nil {
				return err
			}
		case "image":
			if err := validateIdleImageSlide(slideRaw, prefix); err != nil {
				return err
			}
		case "video":
			if err := validateIdleVideoSlide(slideRaw, prefix); err != nil {
				return err
			}
		default:
			return ErrSurveyBadRequest
		}
	}
	return nil
}

func validateIdleTextSlide(raw json.RawMessage) error {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var s struct {
		Type     string          `json:"type"`
		ID       string          `json:"id"`
		Markdown json.RawMessage `json:"markdown"`
	}
	if err := dec.Decode(&s); err != nil {
		return ErrSurveyBadRequest
	}
	if strings.TrimSpace(s.Type) != "text" {
		return ErrSurveyBadRequest
	}
	if s.ID != "" {
		if _, err := uuid.Parse(strings.TrimSpace(s.ID)); err != nil {
			return ErrSurveyBadRequest
		}
	}
	if len(s.Markdown) == 0 {
		return ErrSurveyBadRequest
	}
	return validateCompletionMessage(s.Markdown)
}

func validateIdleImageSlide(raw json.RawMessage, expectedPrefix string) error {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var s struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		URL  string `json:"url"`
	}
	if err := dec.Decode(&s); err != nil {
		return ErrSurveyBadRequest
	}
	if strings.TrimSpace(s.Type) != "image" {
		return ErrSurveyBadRequest
	}
	if s.ID != "" {
		if _, err := uuid.Parse(strings.TrimSpace(s.ID)); err != nil {
			return ErrSurveyBadRequest
		}
	}
	u := strings.TrimSpace(s.URL)
	if !strings.HasPrefix(u, expectedPrefix) {
		return ErrSurveyBadRequest
	}
	fn := strings.TrimPrefix(u, expectedPrefix)
	if fn == "" || strings.Contains(fn, "/") {
		return ErrSurveyBadRequest
	}
	if !surveyIdleImageFileRe.MatchString(fn) {
		return ErrSurveyBadRequest
	}
	return nil
}

func validateIdleVideoSlide(raw json.RawMessage, expectedPrefix string) error {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var s struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		URL  string `json:"url"`
	}
	if err := dec.Decode(&s); err != nil {
		return ErrSurveyBadRequest
	}
	if strings.TrimSpace(s.Type) != "video" {
		return ErrSurveyBadRequest
	}
	if s.ID != "" {
		if _, err := uuid.Parse(strings.TrimSpace(s.ID)); err != nil {
			return ErrSurveyBadRequest
		}
	}
	u := strings.TrimSpace(s.URL)
	if !strings.HasPrefix(u, expectedPrefix) {
		return ErrSurveyBadRequest
	}
	fn := strings.TrimPrefix(u, expectedPrefix)
	if fn == "" || strings.Contains(fn, "/") {
		return ErrSurveyBadRequest
	}
	if !surveyIdleVideoFileRe.MatchString(fn) {
		return ErrSurveyBadRequest
	}
	return nil
}

// ExtractIdleMediaFileNames returns unique file names referenced by image/video slides (best-effort parse).
func ExtractIdleMediaFileNames(raw json.RawMessage) []string {
	if len(raw) == 0 || !json.Valid(raw) {
		return nil
	}
	var top struct {
		Slides []json.RawMessage `json:"slides"`
	}
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil
	}
	seen := map[string]struct{}{}
	var names []string
	for _, slideRaw := range top.Slides {
		var head struct {
			Type string `json:"type"`
			URL  string `json:"url"`
		}
		if err := json.Unmarshal(slideRaw, &head); err != nil {
			continue
		}
		t := strings.TrimSpace(head.Type)
		if t != "image" && t != "video" {
			continue
		}
		u := strings.TrimSpace(head.URL)
		if u == "" {
			continue
		}
		i := strings.LastIndex(u, "/")
		if i < 0 || i >= len(u)-1 {
			continue
		}
		fn := u[i+1:]
		if fn == "" || strings.Contains(fn, "/") {
			continue
		}
		if _, ok := seen[fn]; ok {
			continue
		}
		seen[fn] = struct{}{}
		names = append(names, fn)
	}
	return names
}

type SurveyService interface {
	ListDefinitions(ctx context.Context, actorUserID, scopeUnitID string) ([]models.SurveyDefinition, error)
	CreateDefinition(ctx context.Context, actorUserID, scopeUnitID, title string, questions json.RawMessage, completionMessage *json.RawMessage, displayTheme *json.RawMessage, idleScreen *json.RawMessage) (*models.SurveyDefinition, error)
	UpdateDefinition(ctx context.Context, actorUserID, scopeUnitID, surveyID string, title *string, questions *json.RawMessage, completionMessage *json.RawMessage, displayTheme *json.RawMessage, idleScreen *json.RawMessage) error
	SetActiveDefinition(ctx context.Context, actorUserID, scopeUnitID, surveyID string) error

	ListResponses(ctx context.Context, actorUserID, unitID string, limit, offset int) ([]models.SurveyResponse, error)
	ListResponsesForClient(ctx context.Context, actorUserID, unitID, clientID string) ([]models.SurveyResponse, error)

	GuestSession(ctx context.Context, unitID, terminalID string) (*GuestSurveySession, error)
	// CounterBoardSession: above-counter ticket display only — no survey definitions (independent of guest survey feature).
	CounterBoardSession(ctx context.Context, unitID, terminalID string) (*CounterBoardSession, error)
	SubmitGuestResponse(ctx context.Context, unitID, terminalID, ticketID, surveyID string, answers json.RawMessage) error

	CompanyIDForUnit(unitID string) (string, error)
	EnsureGuestSurveyUploadAccess(actorUserID, unitID string) error
	// EnsureIdleMediaFileDeletable returns ErrSurveyIdleMediaInUse if any survey definition still references the file.
	EnsureIdleMediaFileDeletable(companyID, fileName string) error
	// EnsureCompletionImageRead: staff (user JWT) or counter terminal JWT may read completion images for unit.
	EnsureCompletionImageRead(unitID, tokenType, userID, terminalUnitID, terminalCounterID string) error
}

type surveyService struct {
	surveyRepo   repository.SurveyRepository
	unitRepo     repository.UnitRepository
	userRepo     repository.UserRepository
	ticketRepo   repository.TicketRepository
	terminalRepo repository.DesktopTerminalRepository
	counterRepo  repository.CounterRepository
	storage      StorageService
}

func NewSurveyService(
	surveyRepo repository.SurveyRepository,
	unitRepo repository.UnitRepository,
	userRepo repository.UserRepository,
	ticketRepo repository.TicketRepository,
	terminalRepo repository.DesktopTerminalRepository,
	counterRepo repository.CounterRepository,
	storage StorageService,
) SurveyService {
	return &surveyService{
		surveyRepo:   surveyRepo,
		unitRepo:     unitRepo,
		userRepo:     userRepo,
		ticketRepo:   ticketRepo,
		terminalRepo: terminalRepo,
		counterRepo:  counterRepo,
		storage:      storage,
	}
}

func (s *surveyService) deleteOrphanIdleMedia(ctx context.Context, companyID string, oldRaw, newRaw json.RawMessage) {
	if s.storage == nil {
		return
	}
	oldNames := ExtractIdleMediaFileNames(oldRaw)
	newSet := map[string]struct{}{}
	for _, n := range ExtractIdleMediaFileNames(newRaw) {
		newSet[n] = struct{}{}
	}
	for _, n := range oldNames {
		if _, ok := newSet[n]; ok {
			continue
		}
		cnt, err := s.surveyRepo.CountDefinitionsReferencingIdleMediaFile(ctx, companyID, n)
		if err != nil {
			logger.ErrorfCtx(ctx, "idle_screen orphan count %s: %v", n, err)
			continue
		}
		if cnt > 0 {
			continue
		}
		key := fmt.Sprintf("tenants/%s/%s/%s", companyID, GuestSurveyIdleMediaCategory, n)
		if err := s.storage.DeleteFile(ctx, key); err != nil {
			logger.ErrorfCtx(ctx, "idle_screen orphan delete %s: %v", key, err)
		}
	}
}

func (s *surveyService) EnsureIdleMediaFileDeletable(companyID, fileName string) error {
	n, err := s.surveyRepo.CountDefinitionsReferencingIdleMediaFile(context.Background(), companyID, fileName)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrSurveyIdleMediaInUse
	}
	return nil
}

func (s *surveyService) ensureUnitAccess(userID, unitID string) error {
	ok, err := s.userRepo.IsAdminOrHasUnitAccess(userID, unitID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrSurveyForbidden
	}
	return nil
}

func (s *surveyService) ensureFeatureForUnit(unitID string) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		if repository.IsNotFound(err) {
			return ErrSurveyNotFound
		}
		return err
	}
	ok, err := CompanyHasPlanFeature(u.CompanyID, PlanFeatureCounterGuestSurvey)
	if err != nil {
		return err
	}
	if !ok {
		return ErrSurveyFeatureLocked
	}
	return nil
}

func (s *surveyService) ensureCounterBoardFeatureForUnit(unitID string) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		if repository.IsNotFound(err) {
			return ErrSurveyNotFound
		}
		return err
	}
	ok, err := CompanyHasCounterBoardFeature(u.CompanyID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrSurveyFeatureLocked
	}
	return nil
}

func (s *surveyService) CompanyIDForUnit(unitID string) (string, error) {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		if repository.IsNotFound(err) {
			return "", ErrSurveyNotFound
		}
		return "", err
	}
	return u.CompanyID, nil
}

func (s *surveyService) EnsureGuestSurveyUploadAccess(actorUserID, unitID string) error {
	ok, err := s.userRepo.IsPlatformAdmin(actorUserID)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	if err := s.ensureUnitAccess(actorUserID, unitID); err != nil {
		return err
	}
	return s.ensureFeatureForUnit(unitID)
}

func (s *surveyService) EnsureCompletionImageRead(unitID, tokenType, userID, terminalUnitID, terminalCounterID string) error {
	if tokenType == "terminal" {
		if terminalUnitID != unitID || strings.TrimSpace(terminalCounterID) == "" {
			return ErrSurveyForbidden
		}
		return s.ensureFeatureForUnit(unitID)
	}
	if userID == "" {
		return ErrSurveyForbidden
	}
	ok, err := s.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	if err := s.ensureUnitAccess(userID, unitID); err != nil {
		return err
	}
	return s.ensureFeatureForUnit(unitID)
}

func (s *surveyService) ListDefinitions(ctx context.Context, actorUserID, scopeUnitID string) ([]models.SurveyDefinition, error) {
	if err := s.ensureUnitAccess(actorUserID, scopeUnitID); err != nil {
		return nil, err
	}
	if err := s.ensureFeatureForUnit(scopeUnitID); err != nil {
		return nil, err
	}
	return s.surveyRepo.ListDefinitionsByScopeUnit(ctx, scopeUnitID)
}

func (s *surveyService) CreateDefinition(ctx context.Context, actorUserID, scopeUnitID, title string, questions json.RawMessage, completionMessage *json.RawMessage, displayTheme *json.RawMessage, idleScreen *json.RawMessage) (*models.SurveyDefinition, error) {
	if err := s.ensureUnitAccess(actorUserID, scopeUnitID); err != nil {
		return nil, err
	}
	if err := s.ensureFeatureForUnit(scopeUnitID); err != nil {
		return nil, err
	}
	t := strings.TrimSpace(title)
	if t == "" {
		return nil, ErrSurveyBadRequest
	}
	if len(questions) == 0 || !json.Valid(questions) {
		return nil, ErrSurveyBadRequest
	}
	var cm json.RawMessage
	if completionMessage != nil && len(*completionMessage) > 0 {
		if err := validateCompletionMessage(*completionMessage); err != nil {
			return nil, err
		}
		cm = *completionMessage
	}
	var dt json.RawMessage
	if displayTheme != nil && len(*displayTheme) > 0 {
		if err := validateDisplayTheme(*displayTheme); err != nil {
			return nil, err
		}
		dt = *displayTheme
	}
	var is json.RawMessage
	if idleScreen != nil && len(*idleScreen) > 0 {
		if err := validateIdleScreen(*idleScreen, scopeUnitID); err != nil {
			return nil, err
		}
		is = *idleScreen
	}
	u, err := s.unitRepo.FindByIDLight(scopeUnitID)
	if err != nil {
		return nil, err
	}
	d := &models.SurveyDefinition{
		CompanyID:         u.CompanyID,
		ScopeUnitID:       scopeUnitID,
		Title:             t,
		Questions:         questions,
		CompletionMessage: cm,
		DisplayTheme:      dt,
		IdleScreen:        is,
		IsActive:          false,
	}
	if err := s.surveyRepo.CreateDefinition(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *surveyService) UpdateDefinition(ctx context.Context, actorUserID, scopeUnitID, surveyID string, title *string, questions *json.RawMessage, completionMessage *json.RawMessage, displayTheme *json.RawMessage, idleScreen *json.RawMessage) error {
	if err := s.ensureUnitAccess(actorUserID, scopeUnitID); err != nil {
		return err
	}
	if err := s.ensureFeatureForUnit(scopeUnitID); err != nil {
		return err
	}
	d, err := s.surveyRepo.FindDefinitionByID(ctx, surveyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSurveyNotFound
		}
		return err
	}
	if d.ScopeUnitID != scopeUnitID {
		return ErrSurveyForbidden
	}
	oldIdle := append(json.RawMessage(nil), d.IdleScreen...)
	if title != nil {
		t := strings.TrimSpace(*title)
		if t == "" {
			return ErrSurveyBadRequest
		}
		d.Title = t
	}
	if questions != nil {
		if len(*questions) == 0 || !json.Valid(*questions) {
			return ErrSurveyBadRequest
		}
		d.Questions = *questions
	}
	if completionMessage != nil {
		if len(*completionMessage) == 0 {
			d.CompletionMessage = nil
		} else {
			if err := validateCompletionMessage(*completionMessage); err != nil {
				return err
			}
			d.CompletionMessage = *completionMessage
		}
	}
	if displayTheme != nil {
		if len(*displayTheme) == 0 {
			d.DisplayTheme = nil
		} else {
			if err := validateDisplayTheme(*displayTheme); err != nil {
				return err
			}
			d.DisplayTheme = *displayTheme
		}
	}
	if idleScreen != nil {
		if len(*idleScreen) == 0 {
			d.IdleScreen = nil
		} else {
			if err := validateIdleScreen(*idleScreen, scopeUnitID); err != nil {
				return err
			}
			d.IdleScreen = *idleScreen
		}
	}
	if err := s.surveyRepo.UpdateDefinition(ctx, d); err != nil {
		return err
	}
	if idleScreen != nil {
		s.deleteOrphanIdleMedia(ctx, d.CompanyID, oldIdle, d.IdleScreen)
	}
	return nil
}

func (s *surveyService) SetActiveDefinition(ctx context.Context, actorUserID, scopeUnitID, surveyID string) error {
	if err := s.ensureUnitAccess(actorUserID, scopeUnitID); err != nil {
		return err
	}
	if err := s.ensureFeatureForUnit(scopeUnitID); err != nil {
		return err
	}
	d, err := s.surveyRepo.FindDefinitionByID(ctx, surveyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSurveyNotFound
		}
		return err
	}
	if d.ScopeUnitID != scopeUnitID {
		return ErrSurveyForbidden
	}
	return s.surveyRepo.SetActiveDefinition(ctx, scopeUnitID, surveyID)
}

func (s *surveyService) ListResponses(ctx context.Context, actorUserID, unitID string, limit, offset int) ([]models.SurveyResponse, error) {
	if err := s.ensureUnitAccess(actorUserID, unitID); err != nil {
		return nil, err
	}
	u, err := s.userRepo.FindByID(ctx, actorUserID)
	if err != nil {
		return nil, err
	}
	if !repository.UserCanViewSurveyResponses(u, unitID) {
		return nil, ErrSurveyForbidden
	}
	return s.surveyRepo.ListResponsesByUnit(ctx, unitID, limit, offset)
}

func (s *surveyService) ListResponsesForClient(ctx context.Context, actorUserID, unitID, clientID string) ([]models.SurveyResponse, error) {
	if err := s.ensureUnitAccess(actorUserID, unitID); err != nil {
		return nil, err
	}
	u, err := s.userRepo.FindByID(ctx, actorUserID)
	if err != nil {
		return nil, err
	}
	if !repository.UserCanViewSurveyResponses(u, unitID) {
		return nil, ErrSurveyForbidden
	}
	return s.surveyRepo.ListResponsesByClient(ctx, unitID, clientID)
}

func (s *surveyService) resolveActiveSurveyByZoneOrUnit(ctx context.Context, serviceZoneID *string, unitID string) (*models.SurveyDefinition, error) {
	if serviceZoneID != nil {
		z := strings.TrimSpace(*serviceZoneID)
		if z != "" {
			def, err := s.surveyRepo.FindActiveDefinitionByScopeUnit(ctx, z)
			if err == nil {
				return def, nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
		}
	}
	def, err := s.surveyRepo.FindActiveDefinitionByScopeUnit(ctx, unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return def, nil
}

func (s *surveyService) resolveActiveSurveyForTicket(ctx context.Context, ticket *models.Ticket) (*models.SurveyDefinition, error) {
	return s.resolveActiveSurveyByZoneOrUnit(ctx, ticket.ServiceZoneID, ticket.UnitID)
}

func (s *surveyService) resolveActiveSurveyForCounter(ctx context.Context, counter *models.Counter) (*models.SurveyDefinition, error) {
	return s.resolveActiveSurveyByZoneOrUnit(ctx, counter.ServiceZoneID, counter.UnitID)
}

func (s *surveyService) GuestSession(ctx context.Context, unitID, terminalID string) (*GuestSurveySession, error) {
	unitID = strings.ToLower(strings.TrimSpace(unitID))
	terminalID = strings.ToLower(strings.TrimSpace(terminalID))
	tm, err := s.terminalRepo.FindByID(terminalID)
	if err != nil {
		if repository.IsNotFound(err) {
			return nil, ErrSurveyForbidden
		}
		return nil, err
	}
	if tm.RevokedAt != nil {
		return nil, ErrSurveyForbidden
	}
	if strings.ToLower(strings.TrimSpace(tm.UnitID)) != unitID {
		return nil, ErrSurveyForbidden
	}
	if tm.CounterID == nil || *tm.CounterID == "" {
		return nil, ErrSurveyBadRequest
	}
	kind := models.EffectiveTerminalKind(tm)
	switch kind {
	case models.DesktopTerminalKindCounterBoard:
		// Use GET /units/{unitId}/counter-board/session — no survey payloads, no guest survey feature gate.
		return nil, ErrSurveyBadRequest
	case models.DesktopTerminalKindCounterGuestSurvey:
		if err := s.ensureFeatureForUnit(unitID); err != nil {
			return nil, err
		}
	default:
		return nil, ErrSurveyForbidden
	}

	counter, err := s.counterRepo.FindByID(*tm.CounterID)
	if err != nil {
		return nil, err
	}

	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return nil, err
	}

	out := &GuestSurveySession{
		CounterID:   counter.ID,
		CounterName: counter.Name,
	}
	if len(u.Config) > 0 {
		out.UnitConfig = u.Config
	}

	idleDef, err := s.resolveActiveSurveyForCounter(ctx, counter)
	if err != nil {
		return nil, err
	}
	if idleDef != nil && len(idleDef.IdleScreen) > 0 {
		out.IdleScreen = idleDef.IdleScreen
	}

	// Include called + in_service so headers show the ticket as soon as the guest is called.
	ticket, err := s.ticketRepo.GetActiveTicketByCounter(counter.ID)
	if err != nil {
		return nil, err
	}
	if ticket != nil {
		out.ActiveTicket = &GuestSurveySessionTicket{
			ID:          ticket.ID,
			QueueNumber: ticket.QueueNumber,
			Status:      ticket.Status,
		}
		def, err := s.resolveActiveSurveyForTicket(ctx, ticket)
		if err != nil {
			return nil, err
		}
		if def != nil {
			out.Survey = &GuestSurveySessionSurvey{
				ID:                def.ID,
				Title:             def.Title,
				Questions:         def.Questions,
				CompletionMessage: def.CompletionMessage,
				DisplayTheme:      def.DisplayTheme,
			}
			submitted, err := s.surveyRepo.ResponseExistsForTicketAndSurvey(ctx, ticket.ID, def.ID)
			if err != nil {
				return nil, err
			}
			out.ActiveSurveySubmitted = submitted
		}
	}

	return out, nil
}

// buildCounterBoardSessionPayload maps counter, unit, and optional active ticket into the counter-board API DTO.
func buildCounterBoardSessionPayload(counter *models.Counter, u *models.Unit, ticket *models.Ticket) *CounterBoardSession {
	staffed := counter.AssignedTo != nil
	out := &CounterBoardSession{
		CounterID:      counter.ID,
		CounterName:    counter.Name,
		CounterStaffed: staffed,
		OnBreak:        counter.OnBreak,
	}
	if len(u.Config) > 0 {
		out.UnitConfig = u.Config
	}
	if ticket != nil {
		out.ActiveTicket = &CounterBoardSessionTicket{
			ID:          ticket.ID,
			QueueNumber: ticket.QueueNumber,
			Status:      ticket.Status,
		}
	}
	return out
}

func (s *surveyService) CounterBoardSession(ctx context.Context, unitID, terminalID string) (*CounterBoardSession, error) {
	unitID = strings.ToLower(strings.TrimSpace(unitID))
	terminalID = strings.ToLower(strings.TrimSpace(terminalID))
	tm, err := s.terminalRepo.FindByID(terminalID)
	if err != nil {
		if repository.IsNotFound(err) {
			return nil, ErrSurveyForbidden
		}
		return nil, err
	}
	if tm.RevokedAt != nil {
		return nil, ErrSurveyForbidden
	}
	if strings.ToLower(strings.TrimSpace(tm.UnitID)) != unitID {
		return nil, ErrSurveyForbidden
	}
	if tm.CounterID == nil || *tm.CounterID == "" {
		return nil, ErrSurveyBadRequest
	}
	if models.EffectiveTerminalKind(tm) != models.DesktopTerminalKindCounterBoard {
		return nil, ErrSurveyForbidden
	}
	if err := s.ensureCounterBoardFeatureForUnit(unitID); err != nil {
		return nil, err
	}

	counter, err := s.counterRepo.FindByID(*tm.CounterID)
	if err != nil {
		if repository.IsNotFound(err) {
			return nil, ErrSurveyNotFound
		}
		return nil, err
	}

	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		if repository.IsNotFound(err) {
			return nil, ErrSurveyNotFound
		}
		return nil, err
	}

	ticket, err := s.ticketRepo.GetActiveTicketByCounterLight(counter.ID)
	if err != nil {
		return nil, err
	}

	return buildCounterBoardSessionPayload(counter, u, ticket), nil
}

func (s *surveyService) SubmitGuestResponse(ctx context.Context, unitID, terminalID, ticketID, surveyID string, answers json.RawMessage) error {
	if len(answers) == 0 || !json.Valid(answers) {
		return ErrSurveyBadRequest
	}
	unitID = strings.ToLower(strings.TrimSpace(unitID))
	terminalID = strings.ToLower(strings.TrimSpace(terminalID))
	tm, err := s.terminalRepo.FindByID(terminalID)
	if err != nil {
		if repository.IsNotFound(err) {
			return ErrSurveyForbidden
		}
		return err
	}
	if tm.RevokedAt != nil || strings.ToLower(strings.TrimSpace(tm.UnitID)) != unitID {
		return ErrSurveyForbidden
	}
	if tm.CounterID == nil || *tm.CounterID == "" {
		return ErrSurveyBadRequest
	}
	if models.EffectiveTerminalKind(tm) == models.DesktopTerminalKindCounterBoard {
		return ErrSurveyBadRequest
	}
	if err := s.ensureFeatureForUnit(unitID); err != nil {
		return err
	}

	ticket, err := s.ticketRepo.FindByID(ticketID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSurveyNotFound
		}
		return err
	}
	if ticket.Status != "in_service" || ticket.CounterID == nil || *ticket.CounterID != *tm.CounterID {
		return ErrSurveyBadRequest
	}
	if strings.ToLower(strings.TrimSpace(ticket.UnitID)) != unitID {
		return ErrSurveyForbidden
	}

	def, err := s.surveyRepo.FindDefinitionByID(ctx, surveyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSurveyNotFound
		}
		return err
	}
	resolved, err := s.resolveActiveSurveyForTicket(ctx, ticket)
	if err != nil {
		return err
	}
	if resolved == nil || resolved.ID != def.ID {
		return ErrSurveyBadRequest
	}

	now := time.Now().UTC()
	row := &models.SurveyResponse{
		SurveyDefinitionID: def.ID,
		TicketID:           ticket.ID,
		CounterID:          *tm.CounterID,
		UnitID:             ticket.UnitID,
		Answers:            answers,
		SubmittedAt:        now,
	}
	if ticket.ClientID != nil && *ticket.ClientID != "" {
		row.ClientID = ticket.ClientID
	}
	return s.surveyRepo.UpsertResponse(ctx, row)
}
