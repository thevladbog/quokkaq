package services

import (
	"fmt"
	"io"
	"net/http"
)

// maxMicrosoftGraphResponseBodyBytes caps single Graph API response reads (OAuth + sync).
const maxMicrosoftGraphResponseBodyBytes = 1 << 20

func readMicrosoftGraphResponseBody(resp *http.Response) ([]byte, error) {
	if resp == nil {
		return nil, fmt.Errorf("nil response")
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxMicrosoftGraphResponseBodyBytes+1))
	if err != nil {
		return nil, err
	}
	if len(b) > maxMicrosoftGraphResponseBodyBytes {
		return nil, fmt.Errorf("microsoft graph response body exceeds %d bytes", maxMicrosoftGraphResponseBodyBytes)
	}
	return b, nil
}
