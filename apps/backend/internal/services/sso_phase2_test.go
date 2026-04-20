package services

import (
	"context"
	"errors"
	"os"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/testsupport"

	"gorm.io/gorm"
)

func init() {
	if os.Getenv("JWT_SECRET") == "" {
		_ = os.Setenv("JWT_SECRET", "unit-test-jwt-secret-key-min-32-chars!!")
	}
}

type fakeAuthExchange struct{}

func (fakeAuthExchange) Login(string, string, string) (*TokenPair, error) { panic("unexpected") }
func (fakeAuthExchange) GetMe(string) (*models.User, error)               { panic("unexpected") }
func (fakeAuthExchange) RequestPasswordReset(string) error                { panic("unexpected") }
func (fakeAuthExchange) ResetPassword(string, string) error               { panic("unexpected") }
func (fakeAuthExchange) Signup(string, string, string, string, string, *string, bool) (*TokenPair, error) {
	panic("unexpected")
}
func (fakeAuthExchange) Refresh(string) (*TokenPair, error) { panic("unexpected") }
func (fakeAuthExchange) IssueTokenPairForUserID(string) (*TokenPair, error) {
	return &TokenPair{AccessToken: "at", RefreshToken: "rt"}, nil
}

func TestExchangeFinishCode_MissingCode(t *testing.T) {
	t.Parallel()
	svc := NewSSOService(testsupport.PanicCompanyRepo{}, testsupport.PanicUserRepo{}, testsupport.PanicSSORepo{}, testsupport.PanicUnitRepo{}, nil, fakeAuthExchange{})
	_, err := svc.ExchangeFinishCode(context.Background(), "   ")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestExchangeFinishCode_RedisDisabled(t *testing.T) {
	t.Setenv("SSO_REDIS_DISABLED", "true")
	svc := NewSSOService(testsupport.PanicCompanyRepo{}, testsupport.PanicUserRepo{}, testsupport.PanicSSORepo{}, testsupport.PanicUnitRepo{}, nil, fakeAuthExchange{})
	_, err := svc.ExchangeFinishCode(context.Background(), "sometoken")
	if err == nil {
		t.Fatal("expected error when redis unavailable")
	}
}

func TestTenantHint_ChooseSlugWhenNoAtSign(t *testing.T) {
	t.Parallel()
	svc := NewSSOService(testsupport.PanicCompanyRepo{}, testsupport.PanicUserRepo{}, testsupport.PanicSSORepo{}, testsupport.PanicUnitRepo{}, nil, fakeAuthExchange{})
	out := svc.TenantHint("not-an-email")
	if out.Next != "choose_slug" || out.SsoAvailable {
		t.Fatalf("got %+v", out)
	}
}

func TestPublicTenantBySlug_StrictNotFound(t *testing.T) {
	t.Parallel()
	svc := NewSSOService(testsupport.StrictPublicTenantCompanyRepo{}, testsupport.PanicUserRepo{}, testsupport.PanicSSORepo{}, testsupport.PanicUnitRepo{}, nil, fakeAuthExchange{})
	_, err := svc.PublicTenantBySlug("acme-corp")
	if err == nil || !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
}
