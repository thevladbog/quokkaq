package commerceml

import (
	"encoding/json"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// counterpartyExport holds Контрагент fields for CommerceML (УНФ / «как у ИМ»).
type counterpartyExport struct {
	SiteID   string
	Name     string
	INN      string
	KPP      string
	FullName string
}

func stringFromMap(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case string:
				s := strings.TrimSpace(t)
				if s != "" {
					return s
				}
			case float64:
				if t == float64(int64(t)) {
					return fmt.Sprintf("%.0f", t)
				}
				return fmt.Sprint(t)
			}
		}
	}
	return ""
}

func parseJSONMap(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return nil
	}
	return m
}

func mergeCounterpartyMaps(companyCP, buyer json.RawMessage) map[string]interface{} {
	out := make(map[string]interface{})
	for _, src := range []json.RawMessage{companyCP, buyer} {
		m := parseJSONMap(src)
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

// buildCounterpartyExport resolves stable Ид (1С GUID if set, else company UUID), name and RU legal hints.
func buildCounterpartyExport(company *models.Company, inv *models.Invoice) counterpartyExport {
	var out counterpartyExport
	if company == nil {
		return out
	}
	if company.OneCCounterpartyGUID != nil {
		if s := strings.TrimSpace(*company.OneCCounterpartyGUID); s != "" {
			out.SiteID = s
		}
	}
	if out.SiteID == "" {
		out.SiteID = strings.TrimSpace(company.ID)
	}
	out.Name = strings.TrimSpace(company.Name)
	if out.Name == "" {
		out.Name = "Контрагент"
	}

	var buyerSnap json.RawMessage
	if inv != nil {
		buyerSnap = inv.BuyerSnapshot
	}
	m := mergeCounterpartyMaps(company.Counterparty, buyerSnap)
	if len(m) == 0 {
		return out
	}
	// Shared-types / platform: inn, kpp, legalName, displayName, email, phone, billingEmail
	if s := stringFromMap(m, "inn", "INN", "ИНН"); s != "" {
		out.INN = s
	}
	if s := stringFromMap(m, "kpp", "KPP", "КПП"); s != "" {
		out.KPP = s
	}
	if s := stringFromMap(m, "legalName", "legal_name", "fullName", "full_name", "ПолноеНаименование"); s != "" {
		out.FullName = s
	}
	return out
}
