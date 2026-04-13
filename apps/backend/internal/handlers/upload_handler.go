package handlers

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"quokkaq-go-backend/internal/services"
)

// UploadLogoResponse is the JSON body after a successful public image upload.
type UploadLogoResponse struct {
	URL string `json:"url"`
}

type UploadHandler struct {
	storageService services.StorageService
}

func NewUploadHandler(storageService services.StorageService) *UploadHandler {
	return &UploadHandler{
		storageService: storageService,
	}
}

// UploadLogo godoc
// @Id           uploadLogo
// @Summary      Upload logo file
// @Description  Upload kiosk/ad logo (JPG, PNG, SVG, WebP). Admin JWT. Stored under public/logos/.
// @Tags         upload
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "Image file"
// @Success      200  {object}  UploadLogoResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /upload [post]
// @Security     BearerAuth
func (h *UploadHandler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	h.uploadPublicImage(w, r, "logos", []string{".jpg", ".jpeg", ".png", ".svg", ".webp"})
}

// UploadPrinterLogo godoc
// @Id           uploadPrinterLogo
// @Summary      Upload printer logo file
// @Description  Upload thermal-receipt logo (includes BMP). Admin JWT. Stored under public/printer-logos/.
// @Tags         upload
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "Image file"
// @Success      200  {object}  UploadLogoResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /upload-printer-logo [post]
// @Security     BearerAuth
//
// UploadPrinterLogo stores assets for ESC/POS raster (B&W-friendly); allows BMP in addition to common web images.
func (h *UploadHandler) UploadPrinterLogo(w http.ResponseWriter, r *http.Request) {
	h.uploadPublicImage(w, r, "printer-logos", []string{".jpg", ".jpeg", ".png", ".svg", ".webp", ".bmp", ".dib"})
}

func (h *UploadHandler) uploadPublicImage(w http.ResponseWriter, r *http.Request, folder string, allowedExts []string) {
	// Limit upload size to 5MB
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer func() { _ = file.Close() }()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	ok := false
	for _, a := range allowedExts {
		if ext == a {
			ok = true
			break
		}
	}
	if !ok {
		http.Error(
			w,
			fmt.Sprintf("Invalid file type; allowed extensions: %s", strings.Join(allowedExts, ", ")),
			http.StatusBadRequest,
		)
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
		case ".bmp", ".dib":
			contentType = "image/bmp"
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

	url, _, err := h.storageService.UploadFile(r.Context(), fileBytes, header.Filename, folder, contentType)
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, UploadLogoResponse{URL: url})
}
