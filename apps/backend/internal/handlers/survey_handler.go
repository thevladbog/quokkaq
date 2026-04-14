package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

const surveyCompletionImageCategory = "guest-survey-completion"

// Hard caps for multipart bodies (gosec G120 / defense in depth vs ParseMultipartForm memory staging).
const maxSurveyCompletionImageMultipartBytes = 5 << 20 // 5 MiB
const maxSurveyIdleMediaMultipartBytes = 50 << 20      // 50 MiB

// In-memory budget for ParseMultipartForm only; overflow spills to temp files. Total body size is still capped by MaxBytesReader above.
const multipartFormParseMemoryBytes = 1 << 20 // 1 MiB

// UUID + allowed image extension (must match upload validation).
var surveyCompletionImageFileRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|jpg|png|webp|svg)$`)

var surveyIdleImageFileRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|jpg|png|webp|svg)$`)

var surveyIdleVideoFileRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|m4v)$`)

func surveyIdleMediaFileNameOK(fileName string) bool {
	return surveyIdleImageFileRe.MatchString(fileName) || surveyIdleVideoFileRe.MatchString(fileName)
}

type SurveyHandler struct {
	survey  services.SurveyService
	storage services.StorageService
}

func NewSurveyHandler(survey services.SurveyService, storage services.StorageService) *SurveyHandler {
	return &SurveyHandler{survey: survey, storage: storage}
}

// ListDefinitions godoc
// @Summary      List survey definitions for a scope unit
// @Tags         surveys
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id (subdivision or service_zone)"
// @Success      200  {array}   models.SurveyDefinition
// @Router       /units/{unitId}/surveys [get]
func (h *SurveyHandler) ListDefinitions(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.survey.ListDefinitions(userID, unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

type createSurveyRequest struct {
	Title             string          `json:"title"`
	Questions         json.RawMessage `json:"questions" swaggertype:"object"`
	CompletionMessage json.RawMessage `json:"completionMessage,omitempty" swaggertype:"object"`
	DisplayTheme      json.RawMessage `json:"displayTheme,omitempty" swaggertype:"object"`
	IdleScreen        json.RawMessage `json:"idleScreen,omitempty" swaggertype:"object"`
}

// CreateDefinition godoc
// @Summary      Create survey definition
// @Tags         surveys
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        body body createSurveyRequest true "Payload"
// @Success      201  {object}  models.SurveyDefinition
// @ID           CreateSurveyDefinition
// @Router       /units/{unitId}/surveys [post]
func (h *SurveyHandler) CreateDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req createSurveyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if len(req.Questions) == 0 || string(req.Questions) == "null" {
		http.Error(w, "questions are required", http.StatusBadRequest)
		return
	}
	var cm *json.RawMessage
	if len(req.CompletionMessage) > 0 {
		cm = &req.CompletionMessage
	}
	var dt *json.RawMessage
	if len(req.DisplayTheme) > 0 {
		dt = &req.DisplayTheme
	}
	var is *json.RawMessage
	if len(req.IdleScreen) > 0 {
		is = &req.IdleScreen
	}
	d, err := h.survey.CreateDefinition(userID, unitID, req.Title, req.Questions, cm, dt, is)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(d)
}

type patchSurveyRequest struct {
	Title             *string          `json:"title"`
	Questions         *json.RawMessage `json:"questions,omitempty" swaggertype:"object"`
	CompletionMessage *json.RawMessage `json:"completionMessage,omitempty" swaggertype:"object"`
	DisplayTheme      *json.RawMessage `json:"displayTheme,omitempty" swaggertype:"object"`
	IdleScreen        *json.RawMessage `json:"idleScreen,omitempty" swaggertype:"object"`
}

// PatchDefinition godoc
// @Summary      Patch survey definition
// @Tags         surveys
// @Accept       json
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        surveyId path string true "Survey id"
// @Param        body body patchSurveyRequest true "Payload"
// @Success      204
// @Router       /units/{unitId}/surveys/{surveyId} [patch]
func (h *SurveyHandler) PatchDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	surveyID := chi.URLParam(r, "surveyId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req patchSurveyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Title == nil && req.Questions == nil && req.CompletionMessage == nil && req.DisplayTheme == nil && req.IdleScreen == nil {
		http.Error(w, "at least one field is required", http.StatusBadRequest)
		return
	}
	err := h.survey.UpdateDefinition(r.Context(), userID, unitID, surveyID, req.Title, req.Questions, req.CompletionMessage, req.DisplayTheme, req.IdleScreen)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ActivateDefinition godoc
// @Summary      Set survey as the active one for its scope
// @Tags         surveys
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        surveyId path string true "Survey id"
// @Success      204
// @Router       /units/{unitId}/surveys/{surveyId}/activate [post]
func (h *SurveyHandler) ActivateDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	surveyID := chi.URLParam(r, "surveyId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	err := h.survey.SetActiveDefinition(userID, unitID, surveyID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListResponses godoc
// @Summary      List survey responses for a subdivision (requires ACCESS_SURVEY_RESPONSES)
// @Tags         surveys
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit id"
// @Param        limit query int false "Limit"
// @Param        offset query int false "Offset"
// @Success      200  {array}   models.SurveyResponse
// @Router       /units/{unitId}/survey-responses [get]
func (h *SurveyHandler) ListResponses(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := h.survey.ListResponses(userID, unitID, limit, offset)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// ListResponsesForClient godoc
// @Summary      List survey responses for a client (requires ACCESS_SURVEY_RESPONSES)
// @Tags         surveys
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit id"
// @Param        clientId path string true "Client id"
// @Success      200  {array}   models.SurveyResponse
// @Router       /units/{unitId}/clients/{clientId}/survey-responses [get]
func (h *SurveyHandler) ListResponsesForClient(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	clientID := chi.URLParam(r, "clientId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.survey.ListResponsesForClient(userID, unitID, clientID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// UploadSurveyCompletionImageResponse is returned after a successful completion-image upload.
type UploadSurveyCompletionImageResponse struct {
	URL string `json:"url"`
}

// UploadCompletionImage godoc
// @Summary      Upload guest survey completion markdown image
// @Description  Multipart file field "file". Returns an API-relative URL string. The GET for that path requires BearerAuth; it is not usable as a bare <img src> or static markdown image URL—clients must fetch with Authorization and use a blob/object URL (or proxy) to display.
// @Tags         surveys
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        file formData file true "Image file"
// @Success      200  {object}  UploadSurveyCompletionImageResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      413  {string}  string "Request body too large"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/survey-completion-images [post]
func (h *SurveyHandler) UploadCompletionImage(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.survey.EnsureGuestSurveyUploadAccess(userID, unitID); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxSurveyCompletionImageMultipartBytes)
	if err := r.ParseMultipartForm(multipartFormParseMemoryBytes); err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer func() { _ = file.Close() }()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]struct{}{
		".jpg": {}, ".jpeg": {}, ".png": {}, ".svg": {}, ".webp": {},
	}
	if _, ok := allowed[ext]; !ok {
		http.Error(w, "Invalid file type", http.StatusBadRequest)
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	if header.Size > 0 && int64(len(fileBytes)) != header.Size {
		http.Error(w, "Uploaded file size mismatch", http.StatusBadRequest)
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		switch ext {
		case ".svg":
			contentType = "image/svg+xml"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".webp":
			contentType = "image/webp"
		default:
			if mt := mime.TypeByExtension(ext); mt != "" {
				contentType = mt
			}
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	companyID, err := h.survey.CompanyIDForUnit(unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	key, err := h.storage.UploadTenantAsset(r.Context(), companyID, surveyCompletionImageCategory, fileBytes, header.Filename, contentType)
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	base := filepath.Base(key)
	if !surveyCompletionImageFileRe.MatchString(base) {
		http.Error(w, "Invalid storage key", http.StatusInternalServerError)
		return
	}

	apiURL := fmt.Sprintf("/api/units/%s/guest-survey/completion-images/%s", unitID, base)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(UploadSurveyCompletionImageResponse{URL: apiURL})
}

// GetSurveyCompletionImage godoc
// @Summary      Get guest survey completion markdown image (staff or terminal JWT)
// @Description  Streams image bytes. Requires Authorization: Bearer (staff user JWT or counter terminal JWT). This URL is not embeddable from unauthenticated contexts: plain <img src>, Markdown image syntax, or server-side markdown renderers without the token will fail. Clients should fetch with the Bearer token (e.g. browser fetch) and create an object/blob URL, or proxy the bytes with auth.
// @Tags         guest-survey
// @Produce      octet-stream
// @Security     BearerAuth
// @Param        unitId path string true "Unit id"
// @Param        fileName path string true "Object file name (uuid.ext)"
// @Success      200  {file}  binary
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Router       /units/{unitId}/guest-survey/completion-images/{fileName} [get]
func (h *SurveyHandler) GetSurveyCompletionImage(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	fileName := filepath.Base(chi.URLParam(r, "fileName"))
	if fileName == "" || fileName == "." || fileName == ".." {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}
	if !surveyCompletionImageFileRe.MatchString(fileName) {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}

	tokenType, _ := r.Context().Value(authmiddleware.TokenTypeKey).(string)
	userID, _ := authmiddleware.GetUserIDFromContext(r.Context())
	termUnit, _ := r.Context().Value(authmiddleware.TerminalUnitIDKey).(string)
	termCtr, _ := r.Context().Value(authmiddleware.TerminalCounterIDKey).(string)

	if err := h.survey.EnsureCompletionImageRead(unitID, tokenType, userID, termUnit, termCtr); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	companyID, err := h.survey.CompanyIDForUnit(unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	key := fmt.Sprintf("tenants/%s/%s/%s", companyID, surveyCompletionImageCategory, fileName)
	body, contentType, err := h.storage.GetObject(r.Context(), key)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	defer func() { _ = body.Close() }()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, body)
}

// UploadSurveyIdleMediaResponse is returned after a successful idle slide media upload.
type UploadSurveyIdleMediaResponse struct {
	URL string `json:"url"`
}

// UploadIdleMedia godoc
// @Summary      Upload guest survey idle slide image or video
// @Description  Multipart file field "file". Returns an API-relative URL for idle_screen JSON. The GET for that media path requires BearerAuth and is not a public embed URL—counter UIs must fetch with the terminal JWT and use blob URLs (see Get guest survey idle slide media).
// @Tags         surveys
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        file formData file true "Image or video file"
// @Success      200  {object}  UploadSurveyIdleMediaResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      413  {string}  string "Request body too large"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/guest-survey/idle-media [post]
func (h *SurveyHandler) UploadIdleMedia(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.survey.EnsureGuestSurveyUploadAccess(userID, unitID); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxSurveyIdleMediaMultipartBytes)
	if err := r.ParseMultipartForm(multipartFormParseMemoryBytes); err != nil {
		if maxBytesReaderExceeded(err) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer func() { _ = file.Close() }()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]struct{}{
		".jpg": {}, ".jpeg": {}, ".png": {}, ".svg": {}, ".webp": {},
		".mp4": {}, ".webm": {}, ".mov": {}, ".m4v": {},
	}
	if _, ok := allowed[ext]; !ok {
		http.Error(w, "Invalid file type", http.StatusBadRequest)
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	if header.Size > 0 && int64(len(fileBytes)) != header.Size {
		http.Error(w, "Uploaded file size mismatch", http.StatusBadRequest)
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		switch ext {
		case ".svg":
			contentType = "image/svg+xml"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".webp":
			contentType = "image/webp"
		case ".mp4":
			contentType = "video/mp4"
		case ".webm":
			contentType = "video/webm"
		case ".mov":
			contentType = "video/quicktime"
		case ".m4v":
			contentType = "video/x-m4v"
		default:
			if mt := mime.TypeByExtension(ext); mt != "" {
				contentType = mt
			}
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	companyID, err := h.survey.CompanyIDForUnit(unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	key, err := h.storage.UploadTenantAsset(r.Context(), companyID, services.GuestSurveyIdleMediaCategory, fileBytes, header.Filename, contentType)
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	base := filepath.Base(key)
	if !surveyIdleMediaFileNameOK(base) {
		http.Error(w, "Invalid storage key", http.StatusInternalServerError)
		return
	}

	apiURL := fmt.Sprintf("/api/units/%s/guest-survey/idle-media/%s", unitID, base)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(UploadSurveyIdleMediaResponse{URL: apiURL})
}

// GetSurveyIdleMedia godoc
// @Summary      Get guest survey idle slide media (staff or terminal JWT)
// @Description  Streams image/video bytes. Requires Authorization: Bearer. Not a public URL for <img>/<video> src or static markdown—use authenticated fetch and blob/object URLs (or a signed public URL if the product adds one).
// @Tags         guest-survey
// @Produce      octet-stream
// @Security     BearerAuth
// @Param        unitId path string true "Unit id"
// @Param        fileName path string true "Object file name (uuid.ext)"
// @Success      200  {file}  binary
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Not Found"
// @Router       /units/{unitId}/guest-survey/idle-media/{fileName} [get]
func (h *SurveyHandler) GetSurveyIdleMedia(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	fileName := filepath.Base(chi.URLParam(r, "fileName"))
	if fileName == "" || fileName == "." || fileName == ".." {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}
	if !surveyIdleMediaFileNameOK(fileName) {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}

	tokenType, _ := r.Context().Value(authmiddleware.TokenTypeKey).(string)
	userID, _ := authmiddleware.GetUserIDFromContext(r.Context())
	termUnit, _ := r.Context().Value(authmiddleware.TerminalUnitIDKey).(string)
	termCtr, _ := r.Context().Value(authmiddleware.TerminalCounterIDKey).(string)

	if err := h.survey.EnsureCompletionImageRead(unitID, tokenType, userID, termUnit, termCtr); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	companyID, err := h.survey.CompanyIDForUnit(unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	key := fmt.Sprintf("tenants/%s/%s/%s", companyID, services.GuestSurveyIdleMediaCategory, fileName)
	body, contentType, err := h.storage.GetObject(r.Context(), key)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	defer func() { _ = body.Close() }()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, body)
}

// DeleteSurveyIdleMedia godoc
// @Summary      Delete guest survey idle slide media object (S3)
// @Tags         surveys
// @Security     BearerAuth
// @Param        unitId path string true "Scope unit id"
// @Param        fileName path string true "Object file name (uuid.ext)"
// @Success      204
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      409  {string}  string "Conflict — file still referenced by a survey"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/guest-survey/idle-media/{fileName} [delete]
func (h *SurveyHandler) DeleteSurveyIdleMedia(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	userID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.survey.EnsureGuestSurveyUploadAccess(userID, unitID); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	fileName := filepath.Base(chi.URLParam(r, "fileName"))
	if fileName == "" || fileName == "." || fileName == ".." {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}
	if !surveyIdleMediaFileNameOK(fileName) {
		http.Error(w, "Invalid file name", http.StatusBadRequest)
		return
	}

	companyID, err := h.survey.CompanyIDForUnit(unitID)
	if err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	if err := h.survey.EnsureIdleMediaFileDeletable(companyID, fileName); err != nil {
		h.writeSurveyErr(w, err)
		return
	}

	key := fmt.Sprintf("tenants/%s/%s/%s", companyID, services.GuestSurveyIdleMediaCategory, fileName)
	if err := h.storage.DeleteFile(r.Context(), key); err != nil {
		log.Printf("delete idle media %s: %v", key, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *SurveyHandler) writeSurveyErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrSurveyForbidden):
		http.Error(w, "Forbidden", http.StatusForbidden)
	case errors.Is(err, services.ErrSurveyNotFound):
		http.Error(w, "Not found", http.StatusNotFound)
	case errors.Is(err, services.ErrSurveyBadRequest):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrSurveyFeatureLocked):
		http.Error(w, "Feature not enabled for subscription", http.StatusForbidden)
	case errors.Is(err, services.ErrSurveyIdleMediaInUse):
		http.Error(w, "Idle media is still referenced by a survey definition", http.StatusConflict)
	default:
		log.Printf("survey handler: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}
