package services

import (
	"context"
	"fmt"
	"log"
	"time"
)

type TtsService interface {
	GenerateAndUpload(ctx context.Context, text string, ticketID string) (string, error)
}

type ttsService struct {
	storage StorageService
}

func NewTtsService(storage StorageService) TtsService {
	return &ttsService{storage: storage}
}

func (s *ttsService) GenerateAndUpload(ctx context.Context, text string, ticketID string) (string, error) {
	log.Printf("Generating TTS for text: %s", text)

	// Simulate TTS generation delay (respect cancellation / deadlines)
	select {
	case <-time.After(1 * time.Second):
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Create a dummy audio file content
	// In a real implementation, this would come from a TTS provider API (Google Cloud TTS, AWS Polly, etc.)
	dummyAudioContent := []byte(fmt.Sprintf("Fake audio content for ticket %s: %s", ticketID, text))

	fileName := fmt.Sprintf("tts-%s.mp3", ticketID)

	// Upload to S3/MinIO
	url, _, err := s.storage.UploadFile(ctx, dummyAudioContent, fileName, "tts", "audio/mpeg")
	if err != nil {
		return "", err
	}

	log.Printf("TTS generated and uploaded to: %s", url)
	return url, nil
}
