package handlers

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"quokkaq-go-backend/internal/services"
	"strings"
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
	// Limit upload size to 5MB
	r.ParseMultipartForm(5 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".svg" && ext != ".webp" {
		http.Error(w, "Invalid file type. Only JPG, PNG, SVG, and WebP are allowed.", http.StatusBadRequest)
		return
	}

	// Read file content
	fileBytes := make([]byte, header.Size)
	_, err = file.Read(fileBytes)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	// Upload to Storage (MinIO/S3)
	// Folder: logos
	url, _, err := h.storageService.UploadFile(r.Context(), fileBytes, header.Filename, "logos", header.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "Failed to upload file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": url,
	})
}
