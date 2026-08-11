package ssocrypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"strings"

	"quokkaq-go-backend/internal/config"
)

// EncryptAES256GCM encrypts plaintext using AES-256-GCM. Key is derived from SSO_SECRETS_ENCRYPTION_KEY
// (32 raw bytes, or base64/std encoding, or any string hashed with SHA-256 to 32 bytes).
func EncryptAES256GCM(plaintext []byte) (string, error) {
	key, err := loadKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptAES256GCM decrypts a value produced by EncryptAES256GCM.
func DecryptAES256GCM(encoded string) ([]byte, error) {
	key, err := loadKey()
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}

func loadKey() ([]byte, error) {
	s := strings.TrimSpace(os.Getenv("SSO_SECRETS_ENCRYPTION_KEY"))
	if s == "" {
		// Dev fallback derives from the same explicitly configured JWT secret;
		// there is intentionally no predictable default.
		var err error
		s, err = config.JWTSecret()
		if err != nil {
			return nil, errors.New("SSO_SECRETS_ENCRYPTION_KEY or a strong JWT_SECRET must be configured")
		}
	}
	if len(s) == 32 {
		return []byte(s), nil
	}
	if b, err := base64.StdEncoding.DecodeString(s); err == nil && len(b) == 32 {
		return b, nil
	}
	sum := sha256.Sum256([]byte(s))
	return sum[:], nil
}
