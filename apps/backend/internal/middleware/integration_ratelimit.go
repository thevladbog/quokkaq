package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/sso/redisstore"

	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"
)

const (
	integrationAPIRateInterval = 500 * time.Millisecond // ~120 req/min sustained
	integrationAPIBurst        = 60
	maxIntegrationLimiters     = 50_000
	integrationLimiterTTL      = 15 * time.Minute
	// integrationRedisMaxPerWindow caps requests per key in a 60s sliding window when Redis is enabled.
	integrationRedisMaxPerWindow = 180
)

type integrationLimiterEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

var integrationLimiterMu sync.Mutex
var integrationLimiters = make(map[string]*integrationLimiterEntry)

func init() {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			now := time.Now()
			integrationLimiterMu.Lock()
			for k, e := range integrationLimiters {
				if now.Sub(e.lastSeen) > integrationLimiterTTL {
					delete(integrationLimiters, k)
				}
			}
			integrationLimiterMu.Unlock()
		}
	}()
}

func integrationAPIRateLimitUseRedis() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("INTEGRATION_API_RL_REDIS")), "true")
}

// integrationRedisSlidingAllow returns (redisUsed, allowed). If redisUsed is false, caller should apply in-memory limiter.
func integrationRedisSlidingAllow(ctx context.Context, keyID string) (bool, bool) {
	if !integrationAPIRateLimitUseRedis() {
		return false, false
	}
	c := redisstore.Client()
	if c == nil {
		return false, false
	}
	var buf [10]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return true, false
	}
	member := hex.EncodeToString(buf[:])
	nowMs := float64(time.Now().UnixMilli())
	zkey := "integration_rl:sw:" + keyID
	pipe := c.Pipeline()
	pipe.ZRemRangeByScore(ctx, zkey, "-inf", fmt.Sprintf("%f", nowMs-60000))
	pipe.ZAdd(ctx, zkey, redis.Z{Score: nowMs, Member: member})
	pipe.ZCard(ctx, zkey)
	pipe.Expire(ctx, zkey, 90*time.Second)
	cmds, err := pipe.Exec(ctx)
	if err != nil {
		return false, false
	}
	if len(cmds) < 3 {
		return false, false
	}
	n, err := cmds[2].(*redis.IntCmd).Result()
	if err != nil {
		return false, false
	}
	return true, n <= integrationRedisMaxPerWindow
}

func allowIntegrationInMemory(keyID string) bool {
	integrationLimiterMu.Lock()
	ent, found := integrationLimiters[keyID]
	if !found {
		if len(integrationLimiters) >= maxIntegrationLimiters {
			integrationLimiterMu.Unlock()
			return false
		}
		ent = &integrationLimiterEntry{
			lim:      rate.NewLimiter(rate.Every(integrationAPIRateInterval), integrationAPIBurst),
			lastSeen: time.Now(),
		}
		integrationLimiters[keyID] = ent
	} else {
		ent.lastSeen = time.Now()
	}
	lim := ent.lim
	integrationLimiterMu.Unlock()
	return lim.Allow()
}

// IntegrationAPIRateLimit applies a per-integration-key limiter.
// When env INTEGRATION_API_RL_REDIS=true and Redis (REDIS_HOST) is available, uses a 60s sliding window (see integrationRedisMaxPerWindow).
// Otherwise uses an in-process token bucket (reset on API restart; not shared across replicas).
func IntegrationAPIRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keyID, ok := GetIntegrationKeyID(r.Context())
		if !ok || keyID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if used, allowed := integrationRedisSlidingAllow(r.Context(), keyID); used {
			if !allowed {
				http.Error(w, "Too many requests", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if !allowIntegrationInMemory(keyID) {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
