package handlers

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"quokkaq-go-backend/internal/services"
)

type UploadHandler struct {
	storageService services.StorageService
}

func NewUploadHandler(storageService services.StorageService) *UploadHandler {
	return &UploadHandler{
		storageService: storageService,
	}
}

func (h *UploadHandler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	h.uploadPublicImage(w, r, "logos", []string{".jpg", ".jpeg", ".png", ".svg", ".webp"})
}

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
		http.Error(w, "Invalid file type for this upload.", http.StatusBadRequest)
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
		}
	}

	url, _, err := h.storageService.UploadFile(r.Context(), fileBytes, header.Filename, folder, contentType)
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, map[string]string{
		"url": url,
	})
}
