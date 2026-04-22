package publicqueuewidget

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const claimTypeQueueWidget = "public_queue_widget"

// ErrWidgetJWTNotConfigured is returned when PUBLIC_WIDGET_JWT_SECRET is unset.
var ErrWidgetJWTNotConfigured = errors.New("PUBLIC_WIDGET_JWT_SECRET is not set (public widget token signing disabled)")

func jwtSecret() []byte {
	return []byte(strings.TrimSpace(os.Getenv("PUBLIC_WIDGET_JWT_SECRET")))
}

// SecretConfigured is true when the deployment can mint/verify embed tokens.
func SecretConfigured() bool {
	return len(jwtSecret()) > 0
}

// Sign issues an HS256 JWT for public queue status embedding.
func Sign(unitID, companyID string, ttl time.Duration) (string, error) {
	sec := jwtSecret()
	if len(sec) == 0 {
		return "", ErrWidgetJWTNotConfigured
	}
	if ttl <= 0 || ttl > 24*time.Hour {
		ttl = 15 * time.Minute
	}
	now := time.Now().UTC()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"unitId":    strings.TrimSpace(unitID),
		"companyId": strings.TrimSpace(companyID),
		"typ":       claimTypeQueueWidget,
		"iat":       now.Unix(),
		"exp":       now.Add(ttl).Unix(),
	})
	return t.SignedString(sec)
}

// Verify parses and validates a widget JWT.
func Verify(token string) (unitID, companyID string, err error) {
	sec := jwtSecret()
	if len(sec) == 0 {
		return "", "", ErrWidgetJWTNotConfigured
	}
	tok, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return sec, nil
	})
	if err != nil || !tok.Valid {
		return "", "", errors.New("invalid widget token")
	}
	mc, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", errors.New("invalid widget token claims")
	}
	if typ, _ := mc["typ"].(string); typ != claimTypeQueueWidget {
		return "", "", errors.New("invalid widget token type")
	}
	uid, _ := mc["unitId"].(string)
	cid, _ := mc["companyId"].(string)
	uid = strings.TrimSpace(uid)
	cid = strings.TrimSpace(cid)
	if uid == "" || cid == "" {
		return "", "", errors.New("invalid widget token payload")
	}
	return uid, cid, nil
}
