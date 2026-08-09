package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type unitAccessRouteHandlers struct {
	getServicesByUnit            http.HandlerFunc
	getServicesTreeByUnit        http.HandlerFunc
	postKioskPrinterTelemetry    http.HandlerFunc
	postKioskTelemetry           http.HandlerFunc
	postPublicEmployeeIDPResolve http.HandlerFunc
}

func registerUnitAccessRoutes(
	r chi.Router,
	commonAuth func(http.Handler) http.Handler,
	serviceReadAuth func(http.Handler) http.Handler,
	kioskOnlyAuth func(http.Handler) http.Handler,
	employeeIDPRateLimit func(http.Handler) http.Handler,
	handlers unitAccessRouteHandlers,
) {
	r.Group(func(r chi.Router) {
		r.Use(commonAuth)
		r.Use(serviceReadAuth)
		r.Get("/{unitId}/services", handlers.getServicesByUnit)
		r.Get("/{unitId}/services-tree", handlers.getServicesTreeByUnit)
	})

	r.Group(func(r chi.Router) {
		r.Use(commonAuth)
		r.Use(kioskOnlyAuth)
		r.Post("/{unitId}/kiosk-printer-telemetry", handlers.postKioskPrinterTelemetry)
		r.Post("/{unitId}/kiosk-telemetry", handlers.postKioskTelemetry)
		r.With(employeeIDPRateLimit).Post("/{unitId}/employee-idp/resolve", handlers.postPublicEmployeeIDPResolve)
	})
}
