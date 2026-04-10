package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strconv"
	"strings"
)

const paymentAccountsMaxItems = 30

var (
	bicRE   = regexp.MustCompile(`^\d{9}$`)
	ru20RE  = regexp.MustCompile(`^\d{20}$`)
)

type paymentAccountWire struct {
	ID                   string `json:"id"`
	BankName             string `json:"bankName"`
	BIC                  string `json:"bic"`
	CorrespondentAccount string `json:"correspondentAccount"`
	AccountNumber        string `json:"accountNumber"`
	Swift                string `json:"swift"`
	IsDefault            bool   `json:"isDefault"`
}

// normalizePaymentAccountsJSON validates a JSON array of payment accounts and returns canonical JSON bytes.
// Empty input or JSON null yields nil (clear column). Ensures at most one isDefault; if any accounts exist and none default, marks the first as default.
func normalizePaymentAccountsJSON(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return nil, nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil, errors.New("paymentAccounts must be a JSON array")
	}
	if len(arr) == 0 {
		return []byte("[]"), nil
	}
	if len(arr) > paymentAccountsMaxItems {
		return nil, errors.New("paymentAccounts: too many items")
	}
	out := make([]paymentAccountWire, 0, len(arr))
	for i, elem := range arr {
		var w paymentAccountWire
		dec := json.NewDecoder(bytes.NewReader(elem))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&w); err != nil {
			return nil, errors.New("paymentAccounts: invalid item at index " + strconv.Itoa(i))
		}
		var stub json.RawMessage
		if err := dec.Decode(&stub); err != nil {
			if !errors.Is(err, io.EOF) {
				return nil, errors.New("paymentAccounts: invalid item at index " + strconv.Itoa(i))
			}
		} else {
			return nil, errors.New("paymentAccounts: item must be a single object")
		}
		w.BankName = strings.TrimSpace(w.BankName)
		w.BIC = strings.TrimSpace(w.BIC)
		w.CorrespondentAccount = strings.TrimSpace(w.CorrespondentAccount)
		w.AccountNumber = strings.TrimSpace(w.AccountNumber)
		w.Swift = strings.TrimSpace(w.Swift)
		w.ID = strings.TrimSpace(w.ID)
		if w.BIC != "" && !bicRE.MatchString(w.BIC) {
			return nil, errors.New("paymentAccounts: bic must be 9 digits when set")
		}
		if w.CorrespondentAccount != "" && !ru20RE.MatchString(w.CorrespondentAccount) {
			return nil, errors.New("paymentAccounts: correspondentAccount must be 20 digits when set")
		}
		if w.AccountNumber != "" && !ru20RE.MatchString(w.AccountNumber) {
			return nil, errors.New("paymentAccounts: accountNumber must be 20 digits when set")
		}
		out = append(out, w)
	}
	defaultCount := 0
	firstDefault := -1
	for i := range out {
		if out[i].IsDefault {
			defaultCount++
			if firstDefault < 0 {
				firstDefault = i
			}
		}
	}
	if defaultCount > 1 {
		for i := range out {
			out[i].IsDefault = i == firstDefault
		}
	} else if defaultCount == 0 && len(out) > 0 {
		out[0].IsDefault = true
	}
	encoded, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return encoded, nil
}
