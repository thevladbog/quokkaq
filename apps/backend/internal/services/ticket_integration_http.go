package services

import "errors"

// TicketIntegrationHTTPStatus returns upstream HTTP status when err is PlaneHTTPError or YandexTrackerHTTPError.
func TicketIntegrationHTTPStatus(err error) (status int, ok bool) {
	var p *PlaneHTTPError
	if errors.As(err, &p) {
		return p.HTTPStatus, true
	}
	var y *YandexTrackerHTTPError
	if errors.As(err, &y) {
		return y.HTTPStatus, true
	}
	return 0, false
}
