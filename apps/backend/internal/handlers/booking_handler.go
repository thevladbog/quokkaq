package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type BookingHandler struct {
	service  services.BookingService
	userRepo repository.UserRepository
}

func NewBookingHandler(service services.BookingService, userRepo repository.UserRepository) *BookingHandler {
	return &BookingHandler{service: service, userRepo: userRepo}
}

// CreateBooking godoc
// @Summary      Create a new booking
// @Description  Creates a new booking for a service in a unit
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        booking body models.Booking true "Booking Data"
// @Success      201  {object}  models.Booking
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /bookings [post]
func (h *BookingHandler) CreateBooking(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var booking models.Booking
	if err := json.NewDecoder(r.Body).Decode(&booking); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if booking.UnitID == "" {
		http.Error(w, "unitId is required", http.StatusBadRequest)
		return
	}
	allowed, err := h.userRepo.IsAdminOrHasUnitAccess(userID, booking.UnitID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := h.service.CreateBooking(&booking); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSONWithStatus(w, http.StatusCreated, booking)
}

// GetBookingsByUnit godoc
// @Summary      Get bookings by unit
// @Description  Retrieves all bookings for a specific unit
// @Tags         bookings
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Booking
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/bookings [get]
func (h *BookingHandler) GetBookingsByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	bookings, err := h.service.GetBookingsByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, bookings)
}

// GetBookingByID godoc
// @Summary      Get a booking by ID
// @Description  Retrieves a specific booking by its ID
// @Tags         bookings
// @Produce      json
// @Param        id   path      string  true  "Booking ID"
// @Success      200  {object}  models.Booking
// @Failure      404  {string}  string "Booking not found"
// @Router       /bookings/{id} [get]
func (h *BookingHandler) GetBookingByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	booking, err := h.service.GetBookingByID(id)
	if err != nil {
		http.Error(w, "Booking not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, booking)
}

// UpdateBooking godoc
// @Summary      Update a booking
// @Description  Updates an existing booking
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        id      path      string          true  "Booking ID"
// @Param        booking body      models.Booking  true  "Booking Data"
// @Success      200     {object}  models.Booking
// @Failure      400     {string}  string "Bad Request"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /bookings/{id} [put]
func (h *BookingHandler) UpdateBooking(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var booking models.Booking
	if err := json.NewDecoder(r.Body).Decode(&booking); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	booking.ID = id

	if err := h.service.UpdateBooking(&booking); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, booking)
}

// DeleteBooking godoc
// @Summary      Delete a booking
// @Description  Deletes a booking by its ID
// @Tags         bookings
// @Param        id   path      string  true  "Booking ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /bookings/{id} [delete]
func (h *BookingHandler) DeleteBooking(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteBooking(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
