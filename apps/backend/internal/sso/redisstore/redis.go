package redisstore

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	mu     sync.Mutex
	client *redis.Client
)

// Client returns a shared Redis client (same env as Asynq) or nil if REDIS disabled.
func Client() *redis.Client {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("SSO_REDIS_DISABLED")), "true") {
		return nil
	}
	mu.Lock()
	defer mu.Unlock()
	if client != nil {
		return client
	}
	host := strings.TrimSpace(os.Getenv("REDIS_HOST"))
	if host == "" {
		host = "localhost"
	}
	port := strings.TrimSpace(os.Getenv("REDIS_PORT"))
	if port == "" {
		port = "6379"
	}
	pass := os.Getenv("REDIS_PASSWORD")
	addr := fmt.Sprintf("%s:%s", host, port)
	client = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: pass,
		DB:       redisDB(),
	})
	return client
}

func redisDB() int {
	// Optional separate DB for SSO keys (default 0).
	return 0
}

// SetJSON stores a value with TTL.
func SetJSON(ctx context.Context, key string, v any, ttl time.Duration) error {
	c := Client()
	if c == nil {
		return fmt.Errorf("redis not configured")
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.Set(ctx, key, b, ttl).Err()
}

// GetJSON loads JSON into dest. Returns redis.Nil if missing.
func GetJSON(ctx context.Context, key string, dest any) error {
	c := Client()
	if c == nil {
		return fmt.Errorf("redis not configured")
	}
	s, err := c.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(s), dest)
}

// GetAndDeleteJSON atomically reads JSON then removes the key (Redis GETDEL).
// Same error semantics as GetJSON; returns redis.Nil if the key was absent.
func GetAndDeleteJSON(ctx context.Context, key string, dest any) error {
	c := Client()
	if c == nil {
		return fmt.Errorf("redis not configured")
	}
	s, err := c.GetDel(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(s), dest)
}

// Del removes a key.
func Del(ctx context.Context, keys ...string) error {
	c := Client()
	if c == nil {
		return nil
	}
	return c.Del(ctx, keys...).Err()
}

// ResetClientForTest closes and clears the singleton Redis client so tests can bind miniredis.
// Safe to call from tests only; not used in production paths.
func ResetClientForTest() {
	mu.Lock()
	defer mu.Unlock()
	if client != nil {
		_ = client.Close()
		client = nil
	}
}

const KeyPrefix = "quokkaq:sso:"

func KeyOAuthState(state string) string { return KeyPrefix + "oauth:" + state }
func KeyExchange(code string) string    { return KeyPrefix + "xc:" + code }
func KeySAMLRelay(relay string) string  { return KeyPrefix + "saml:relay:" + relay }

// KeyGoogleCalendarOAuthState stores PKCE + unit scope for Google Calendar OAuth (admin flow).
func KeyGoogleCalendarOAuthState(state string) string {
	return KeyPrefix + "gcal-oauth:" + state
}

// KeyGoogleCalendarPickSession stores refresh token + scope until the user picks a calendar (short TTL).
func KeyGoogleCalendarPickSession(token string) string {
	return KeyPrefix + "gcal-pick:" + token
}
