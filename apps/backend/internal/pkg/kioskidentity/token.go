package kioskidentity

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid kiosk identity token")

type Claims struct {
	UnitID string   `json:"unit_id"`
	Groups []string `json:"groups,omitempty"`
	jwt.RegisteredClaims
}

func Sign(unitID, userID string, groups []string) (string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return "", ErrInvalidToken
	}
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UnitID: unitID,
		Groups: groups,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    "quokkaq-kiosk-identity",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		},
	})
	token.Header["typ"] = "kiosk_identity"
	return token.SignedString([]byte(secret))
}

func Verify(tokenString, unitID, userID string) ([]string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" || strings.TrimSpace(tokenString) == "" {
		return nil, ErrInvalidToken
	}
	var claims Claims
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	}, jwt.WithIssuer("quokkaq-kiosk-identity"), jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil || token == nil || !token.Valid || claims.UnitID != unitID || claims.Subject != userID {
		return nil, ErrInvalidToken
	}
	return append([]string(nil), claims.Groups...), nil
}
