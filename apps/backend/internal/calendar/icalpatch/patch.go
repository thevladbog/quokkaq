package icalpatch

import (
	"fmt"
	"strings"

	"github.com/emersion/go-ical"
)

// ApplySummaryDescription updates the first VEVENT in the calendar resource.
func ApplySummaryDescription(cal *ical.Calendar, summary, description string) error {
	evs := cal.Events()
	if len(evs) == 0 {
		return fmt.Errorf("icalpatch: no VEVENT in calendar resource")
	}
	e := evs[0]
	trimmedSummary := strings.TrimSpace(summary)
	trimmedDescription := strings.TrimSpace(description)
	e.Props.SetText(ical.PropSummary, trimmedSummary)
	if trimmedDescription == "" {
		e.Props.Del(ical.PropDescription)
	} else {
		e.Props.SetText(ical.PropDescription, trimmedDescription)
	}
	return nil
}
