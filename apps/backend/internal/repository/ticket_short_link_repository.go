package repository

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// TicketShortLinkRepository maps compact public codes to tickets (SMS / tracking URL shortening).
type TicketShortLinkRepository interface {
	GetByCode(code string) (*models.TicketShortLink, error)
	FindByTicketID(ticketID string) (*models.TicketShortLink, error)
	// GetOrCreate returns the existing code or inserts a new row. Thread-safe under unique constraint on code.
	GetOrCreate(ticketID, companyID, locale string) (code string, err error)
}

type ticketShortLinkRepository struct{}

func NewTicketShortLinkRepository() TicketShortLinkRepository {
	return &ticketShortLinkRepository{}
}

func (r *ticketShortLinkRepository) GetByCode(code string) (*models.TicketShortLink, error) {
	var row models.TicketShortLink
	if err := database.DB.Where("code = ?", code).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ticketShortLinkRepository) FindByTicketID(ticketID string) (*models.TicketShortLink, error) {
	var row models.TicketShortLink
	if err := database.DB.Where("ticket_id = ?", ticketID).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

const shortLinkCodeBytes = 6

func (r *ticketShortLinkRepository) GetOrCreate(ticketID, companyID, locale string) (string, error) {
	if ex, err := r.FindByTicketID(ticketID); err == nil {
		return ex.Code, nil
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}
	lo := strings.TrimSpace(strings.ToLower(locale))
	if lo == "" {
		lo = "ru"
	}
	for i := 0; i < 8; i++ {
		b := make([]byte, shortLinkCodeBytes)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		code := strings.ToLower(hex.EncodeToString(b))[:10]
		row := models.TicketShortLink{
			Code:      code,
			TicketID:  ticketID,
			CompanyID: companyID,
			Locale:    lo,
		}
		if err := database.DB.Create(&row).Error; err != nil {
			if isUniqueViolationPostgres(err) {
				continue
			}
			return "", err
		}
		return code, nil
	}
	return "", fmt.Errorf("short link: could not allocate unique code")
}

func isUniqueViolationPostgres(err error) bool {
	if err == nil {
		return false
	}
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23505" {
		return true
	}
	return false
}
