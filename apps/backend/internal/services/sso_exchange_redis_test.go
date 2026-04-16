package services

import (
	"context"
	"net"
	"os"
	"testing"
	"time"

	"quokkaq-go-backend/internal/sso/redisstore"
	"quokkaq-go-backend/internal/testsupport"

	"github.com/alicebob/miniredis/v2"
)

func TestExchangeFinishCode_SecondCallFailsAfterRedisDelete(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		mr.Close()
		redisstore.ResetClientForTest()
	})

	host, port, err := net.SplitHostPort(mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	prevHost, prevPort, prevDis := os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT"), os.Getenv("SSO_REDIS_DISABLED")
	t.Cleanup(func() {
		restore := func(k, v string) {
			if v == "" {
				_ = os.Unsetenv(k)
			} else {
				_ = os.Setenv(k, v)
			}
		}
		restore("REDIS_HOST", prevHost)
		restore("REDIS_PORT", prevPort)
		restore("SSO_REDIS_DISABLED", prevDis)
	})
	_ = os.Setenv("REDIS_HOST", host)
	_ = os.Setenv("REDIS_PORT", port)
	_ = os.Setenv("SSO_REDIS_DISABLED", "false")
	redisstore.ResetClientForTest()

	ctx := context.Background()
	code := "one-time-code-test"
	if err := redisstore.SetJSON(ctx, redisstore.KeyExchange(code), map[string]string{"userId": "u1"}, time.Minute); err != nil {
		t.Fatal(err)
	}

	svc := NewSSOService(testsupport.PanicCompanyRepo{}, testsupport.PanicUserRepo{}, testsupport.SSORepoNoopAudit{}, fakeAuthExchange{})
	pair, err := svc.ExchangeFinishCode(ctx, code)
	if err != nil || pair == nil || pair.AccessToken == "" {
		t.Fatalf("first exchange: err=%v pair=%v", err, pair)
	}
	_, err2 := svc.ExchangeFinishCode(ctx, code)
	if err2 == nil {
		t.Fatal("expected error on second use of same code")
	}
}
