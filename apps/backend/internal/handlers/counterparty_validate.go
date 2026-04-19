package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const (
	partyTypeLegalEntity    = "legal_entity"
	partyTypeSoleProprietor = "sole_proprietor"
	partyTypeIndividual     = "individual"
)

var (
	inn10    = regexp.MustCompile(`^\d{10}$`)
	inn12    = regexp.MustCompile(`^\d{12}$`)
	kpp9     = regexp.MustCompile(`^\d{9}$`)
	ogrn13   = regexp.MustCompile(`^\d{13}$`)
	ogrnip15 = regexp.MustCompile(`^\d{15}$`)
)

type counterpartyPayload struct {
	SchemaVersion int    `json:"schemaVersion"`
	PartyType     string `json:"partyType"`
	Inn           string `json:"inn"`
	Kpp           string `json:"kpp"`
	Ogrn          string `json:"ogrn"`
	Ogrnip        string `json:"ogrnip"`
}

// validateCounterparty checks JSON shape and RU-style formats for inn/kpp/ogrn by partyType.
func validateCounterparty(raw []byte) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var p counterpartyPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return fmt.Errorf("counterparty must be valid JSON: %w", err)
	}
	if p.PartyType == "" {
		return errors.New("counterparty.partyType is required")
	}
	switch p.PartyType {
	case partyTypeLegalEntity, partyTypeSoleProprietor, partyTypeIndividual:
	default:
		return fmt.Errorf("invalid counterparty.partyType: %q", p.PartyType)
	}
	inn := strings.TrimSpace(p.Inn)
	kpp := strings.TrimSpace(p.Kpp)
	ogrn := strings.TrimSpace(p.Ogrn)
	ogrnip := strings.TrimSpace(p.Ogrnip)

	switch p.PartyType {
	case partyTypeLegalEntity:
		if inn != "" && !inn10.MatchString(inn) {
			return errors.New("counterparty.inn must be 10 digits for legal_entity")
		}
		if kpp != "" && !kpp9.MatchString(kpp) {
			return errors.New("counterparty.kpp must be 9 digits when set")
		}
		if ogrn != "" && !ogrn13.MatchString(ogrn) {
			return errors.New("counterparty.ogrn must be 13 digits when set")
		}
		if ogrnip != "" {
			return errors.New("counterparty.ogrnip must not be set for legal_entity")
		}
	case partyTypeSoleProprietor:
		if inn != "" && !inn12.MatchString(inn) {
			return errors.New("counterparty.inn must be 12 digits for sole_proprietor")
		}
		if kpp != "" {
			return errors.New("counterparty.kpp must not be set for sole_proprietor")
		}
		if ogrnip != "" && !ogrnip15.MatchString(ogrnip) {
			return errors.New("counterparty.ogrnip must be 15 digits when set")
		}
	case partyTypeIndividual:
		if inn != "" && !inn12.MatchString(inn) {
			return errors.New("counterparty.inn must be 12 digits when set for individual")
		}
		if kpp != "" {
			return errors.New("counterparty.kpp must not be set for individual")
		}
		if ogrn != "" || ogrnip != "" {
			return errors.New("counterparty.ogrn/ogrnip must not be set for individual")
		}
	}
	return nil
}
