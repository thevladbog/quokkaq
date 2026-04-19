package services

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	ycsdk "github.com/yandex-cloud/go-sdk/v2"
	"github.com/yandex-cloud/go-sdk/v2/credentials"
	"github.com/yandex-cloud/go-sdk/v2/pkg/options"
)

const yandexIAMRenewMargin = 10 * time.Minute

const yandexIAMExchangeTimeout = 45 * time.Second

// yandexTrackerIAM exchanges a service-account authorized key JSON for short-lived IAM tokens (Yandex Cloud SDK v2).
type yandexTrackerIAM struct {
	mu      sync.Mutex
	keyPath string
	sdk     *ycsdk.SDK
	token   string
	expires time.Time
}

func newYandexTrackerIAM(keyPath string) *yandexTrackerIAM {
	return &yandexTrackerIAM{keyPath: keyPath}
}

func (i *yandexTrackerIAM) keyFileOK() bool {
	_, err := os.Stat(i.keyPath)
	return err == nil
}

// bearerToken returns a cached IAM token or refreshes it via the SDK.
func (i *yandexTrackerIAM) bearerToken(ctx context.Context) (string, error) {
	i.mu.Lock()
	defer i.mu.Unlock()

	now := time.Now()
	if i.token != "" && now.Before(i.expires.Add(-yandexIAMRenewMargin)) {
		return i.token, nil
	}

	callCtx, cancel := context.WithTimeout(ctx, yandexIAMExchangeTimeout)
	defer cancel()

	if i.sdk == nil {
		creds, err := credentials.ServiceAccountKeyFile(i.keyPath)
		if err != nil {
			return "", fmt.Errorf("yandex tracker IAM: load service account key: %w", err)
		}
		sdk, err := ycsdk.Build(callCtx, options.WithCredentials(creds))
		if err != nil {
			return "", fmt.Errorf("yandex tracker IAM: build yandex cloud sdk: %w", err)
		}
		i.sdk = sdk
	}

	tokResp, err := i.sdk.CreateIAMToken(callCtx)
	if err != nil {
		return "", fmt.Errorf("yandex tracker IAM: CreateIAMToken: %w", err)
	}
	token := strings.TrimSpace(tokResp.GetIamToken())
	exp := tokResp.GetExpiresAt()
	if token == "" {
		return "", fmt.Errorf("yandex tracker IAM: empty token from CreateIAMToken")
	}
	i.token = token
	i.expires = exp
	return i.token, nil
}
