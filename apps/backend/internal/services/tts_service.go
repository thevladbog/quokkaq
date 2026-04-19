package services

import (
	"context"
	"fmt"
	"quokkaq-go-backend/internal/logger"
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
	textLen := len(text)

	// Simulate TTS generation delay (respect cancellation / deadlines)
	select {
	case <-time.After(1 * time.Second):
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Create a dummy audio file content (do not embed user text — avoids leaking content into storage/logs).
	// In a real implementation, this would come from a TTS provider API (Google Cloud TTS, AWS Polly, etc.)
	dummyAudioContent := []byte(fmt.Sprintf("Fake audio content for ticket %s", ticketID))

	fileName := fmt.Sprintf("tts-%s.mp3", ticketID)

	logger.PrintfCtx(ctx, "TTS storage upload start ticket_id=%s text_len=%d", ticketID, textLen)

	url, _, err := s.storage.UploadFile(ctx, dummyAudioContent, fileName, "tts", "audio/mpeg")
	if err != nil {
		logger.PrintfCtx(ctx, "TTS storage upload failed ticket_id=%s text_len=%d err=%v", ticketID, textLen, err)
		return "", err
	}

	logger.PrintfCtx(ctx, "TTS storage upload ok ticket_id=%s text_len=%d url=%s", ticketID, textLen, url)
	return url, nil
}
