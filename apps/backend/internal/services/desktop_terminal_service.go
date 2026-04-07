package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	desktopTerminalCodeLen = 10
	desktopTerminalJWTDays = 60
)

var (
	ErrInvalidTerminalCode = errors.New("invalid terminal code")
	ErrInvalidLocale       = errors.New("locale must be en or ru")
)

type DesktopTerminalService interface {
	Create(name *string, unitID, defaultLocale string, kioskFullscreen bool) (*models.DesktopTerminal, string, error)
	List() ([]models.DesktopTerminal, error)
	GetByID(id string) (*models.DesktopTerminal, error)
	Update(id string, name *string, unitID, defaultLocale string, kioskFullscreen bool) error
	Revoke(id string) error
	Bootstrap(pairingCode string) (token, unitID, defaultLocale, appBaseURL string, kioskFullscreen bool, err error)
}

type desktopTerminalService struct {
	repo     repository.DesktopTerminalRepository
	unitRepo repository.UnitRepository
}

func NewDesktopTerminalService(
	repo repository.DesktopTerminalRepository,
	unitRepo repository.UnitRepository,
) DesktopTerminalService {
	return &desktopTerminalService{repo: repo, unitRepo: unitRepo}
}

func (s *desktopTerminalService) codePepper() string {
	if p := os.Getenv("TERMINAL_CODE_PEPPER"); p != "" {
		return p
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "default_secret_please_change"
	}
	return secret
}

func pairingCodeDigest(pepper, code string) string {
	n := strings.TrimSpace(code)
	h := sha256.Sum256([]byte(pepper + "\x00" + n))
	return hex.EncodeToString(h[:])
}

func generatePairingCode(length int) (string, error) {
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"
	if length < 8 {
		length = 8
	}
	out := make([]byte, length)
	for i := range out {
		var b [1]byte
		if _, err := rand.Read(b[:]); err != nil {
			return "", err
		}
		out[i] = alphabet[int(b[0])%len(alphabet)]
	}
	return string(out), nil
}

func validateLocale(loc string) error {
	switch strings.ToLower(strings.TrimSpace(loc)) {
	case "en", "ru":
		return nil
	default:
		return ErrInvalidLocale
	}
}

func (s *desktopTerminalService) Create(name *string, unitID, defaultLocale string, kioskFullscreen bool) (*models.DesktopTerminal, string, error) {
	if err := validateLocale(defaultLocale); err != nil {
		return nil, "", err
	}
	if _, err := s.unitRepo.FindByIDLight(unitID); err != nil {
		if repository.IsNotFound(err) {
			return nil, "", errors.New("unit not found")
		}
		return nil, "", err
	}

	var plain string
	var row *models.DesktopTerminal
	for attempt := 0; attempt < 8; attempt++ {
		code, err := generatePairingCode(desktopTerminalCodeLen)
		if err != nil {
			return nil, "", err
		}
		digest := pairingCodeDigest(s.codePepper(), code)
		hash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(code)), bcrypt.DefaultCost)
		if err != nil {
			return nil, "", err
		}
		loc := strings.ToLower(strings.TrimSpace(defaultLocale))
		row = &models.DesktopTerminal{
			UnitID:            unitID,
			Name:              name,
			DefaultLocale:     loc,
			KioskFullscreen:   kioskFullscreen,
			PairingCodeDigest: digest,
			SecretHash:        string(hash),
		}
		if err := s.repo.Create(row); err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				continue
			}
			return nil, "", err
		}
		plain = code
		break
	}
	if plain == "" {
		return nil, "", errors.New("could not allocate unique pairing code")
	}
	return row, plain, nil
}

func (s *desktopTerminalService) List() ([]models.DesktopTerminal, error) {
	return s.repo.FindAll()
}

func (s *desktopTerminalService) GetByID(id string) (*models.DesktopTerminal, error) {
	return s.repo.FindByID(id)
}

func (s *desktopTerminalService) Update(id string, name *string, unitID, defaultLocale string, kioskFullscreen bool) error {
	if err := validateLocale(defaultLocale); err != nil {
		return err
	}
	if _, err := s.unitRepo.FindByIDLight(unitID); err != nil {
		if repository.IsNotFound(err) {
			return errors.New("unit not found")
		}
		return err
	}
	t, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	t.Name = name
	t.UnitID = unitID
	t.DefaultLocale = strings.ToLower(strings.TrimSpace(defaultLocale))
	t.KioskFullscreen = kioskFullscreen
	return s.repo.Update(t)
}

func (s *desktopTerminalService) Revoke(id string) error {
	t, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	now := time.Now()
	t.RevokedAt = &now
	return s.repo.Update(t)
}

func (s *desktopTerminalService) Bootstrap(pairingCode string) (token, unitID, defaultLocale, appBaseURL string, kioskFullscreen bool, err error) {
	digest := pairingCodeDigest(s.codePepper(), pairingCode)
	t, e := s.repo.FindByPairingCodeDigest(digest)
	if e != nil || t.RevokedAt != nil {
		return "", "", "", "", false, ErrInvalidTerminalCode
	}
	if bcrypt.CompareHashAndPassword([]byte(t.SecretHash), []byte(strings.TrimSpace(pairingCode))) != nil {
		return "", "", "", "", false, ErrInvalidTerminalCode
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}
	exp := time.Now().Add(time.Hour * 24 * desktopTerminalJWTDays)
	claims := jwt.MapClaims{
		"sub":     t.ID,
		"typ":     "terminal",
		"unit_id": t.UnitID,
		"locale":  t.DefaultLocale,
		"exp":     exp.Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, e := tok.SignedString([]byte(secret))
	if e != nil {
		return "", "", "", "", false, e
	}

	now := time.Now()
	t.LastSeenAt = &now
	_ = s.repo.Update(t)

	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = "http://localhost:3000"
	}
	return signed, t.UnitID, t.DefaultLocale, strings.TrimRight(base, "/"), t.KioskFullscreen, nil
}
