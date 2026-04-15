package repository

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
)

// ErrCompanyAccessDenied is returned when X-Company-Id is set but HasCompanyAccess is false.
var ErrCompanyAccessDenied = errors.New("company access denied")

// AccessibleCompanySummary is one tenant the user may act as (login picker / switcher metadata).
type AccessibleCompanySummary struct {
	ID        string
	Name      string
	LegalName *string
	Inn       *string
}

type companyListRow struct {
	ID           string
	Name         string
	Counterparty json.RawMessage `gorm:"column:counterparty"`
}

type counterpartyLite struct {
	Inn       *string `json:"inn"`
	FullName  *string `json:"fullName"`
	ShortName *string `json:"shortName"`
}

func parseCounterpartyLegalAndInn(raw json.RawMessage) (legalName *string, inn *string) {
	if len(raw) == 0 {
		return nil, nil
	}
	var cp counterpartyLite
	if err := json.Unmarshal(raw, &cp); err != nil {
		return nil, nil
	}
	if cp.Inn != nil {
		s := strings.TrimSpace(*cp.Inn)
		if s != "" {
			inn = &s
		}
	}
	var legal string
	if cp.FullName != nil && strings.TrimSpace(*cp.FullName) != "" {
		legal = strings.TrimSpace(*cp.FullName)
	} else if cp.ShortName != nil {
		legal = strings.TrimSpace(*cp.ShortName)
	}
	if legal != "" {
		legalName = &legal
	}
	return legalName, inn
}

func rowToSummary(row companyListRow) AccessibleCompanySummary {
	legal, inn := parseCounterpartyLegalAndInn(row.Counterparty)
	return AccessibleCompanySummary{
		ID:        row.ID,
		Name:      row.Name,
		LegalName: legal,
		Inn:       inn,
	}
}

func summarySearchBlob(s AccessibleCompanySummary, counterpartyRaw json.RawMessage) string {
	var b strings.Builder
	b.WriteString(strings.ToLower(s.Name))
	if s.LegalName != nil {
		b.WriteString(" ")
		b.WriteString(strings.ToLower(*s.LegalName))
	}
	if s.Inn != nil {
		b.WriteString(" ")
		b.WriteString(strings.ToLower(*s.Inn))
	}
	b.WriteString(" ")
	b.WriteString(strings.ToLower(string(counterpartyRaw)))
	return b.String()
}

// ResolveCompanyIDForRequest returns X-Company-Id when set and allowed, else the legacy first-unit company.
func (r *userRepository) ResolveCompanyIDForRequest(userID, headerCompanyID string) (string, error) {
	headerCompanyID = strings.TrimSpace(headerCompanyID)
	if headerCompanyID == "" {
		return r.GetCompanyIDByUserID(userID)
	}
	ok, err := r.HasCompanyAccess(userID, headerCompanyID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrCompanyAccessDenied
	}
	return headerCompanyID, nil
}

// ListAccessibleCompanies returns distinct companies from user_units and from company ownership. q filters case-insensitively on name, legal fields, inn, and raw counterparty JSON.
func (r *userRepository) ListAccessibleCompanies(userID string, q string) ([]AccessibleCompanySummary, error) {
	q = strings.TrimSpace(q)
	qLower := strings.ToLower(q)

	var fromUnits []companyListRow
	if err := r.db.Raw(`
		SELECT DISTINCT c.id, c.name, c.counterparty
		FROM companies c
		INNER JOIN units u ON u.company_id = c.id
		INNER JOIN user_units uu ON uu.unit_id = u.id
		WHERE uu.user_id = ?
	`, userID).Scan(&fromUnits).Error; err != nil {
		return nil, err
	}

	var fromOwner []companyListRow
	if err := r.db.Raw(`
		SELECT c.id, c.name, c.counterparty
		FROM companies c
		WHERE c.owner_user_id = ?
	`, userID).Scan(&fromOwner).Error; err != nil {
		return nil, err
	}

	byID := make(map[string]companyListRow, len(fromUnits)+len(fromOwner))
	for _, row := range fromUnits {
		byID[row.ID] = row
	}
	for _, row := range fromOwner {
		byID[row.ID] = row
	}

	out := make([]AccessibleCompanySummary, 0, len(byID))
	for _, row := range byID {
		sum := rowToSummary(row)
		if qLower != "" {
			blob := summarySearchBlob(sum, row.Counterparty)
			if !strings.Contains(blob, qLower) {
				continue
			}
		}
		out = append(out, sum)
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})

	return out, nil
}
