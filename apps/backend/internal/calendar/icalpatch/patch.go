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
	e.Props.SetText(ical.PropSummary, strings.TrimSpace(summary))
	if strings.TrimSpace(description) == "" {
		e.Props.Del(ical.PropDescription)
	} else {
		e.Props.SetText(ical.PropDescription, description)
	}
	return nil
}
