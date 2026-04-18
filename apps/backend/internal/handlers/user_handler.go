package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type UserHandler struct {
	service services.UserService
}

func NewUserHandler(service services.UserService) *UserHandler {
	return &UserHandler{service: service}
}

// CreateUser godoc
// @Summary      Create a new user
// @Description  Creates a new user with the provided details
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        user body models.User true "User Data"
// @Success      201  {object}  models.User
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users [post]
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var user models.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateUser(&user); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, user)
}

// GetAllUsers godoc
// @Summary      Get all users
// @Description  Retrieves a list of all users
// @Tags         users
// @Produce      json
// @Success      200  {array}   models.User
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users [get]
func (h *UserHandler) GetAllUsers(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	users, err := h.service.GetAllUsers(search)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, users)
}

// GetUserByID godoc
// @Summary      Get a user by ID
// @Description  Retrieves a specific user by their ID
// @Tags         users
// @Produce      json
// @Param        id   path      string  true  "User ID"
// @Success      200  {object}  models.User
// @Failure      404  {string}  string "User not found"
// @Router       /users/{id} [get]
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, user)
}

// DeleteUser godoc
// @Summary      Delete a user
// @Description  Deletes a user by their ID
// @Tags         users
// @Param        id   path      string  true  "User ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /users/{id} [delete]
func (h *UserHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteUser(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateUser godoc
// @Summary      Update a user
// @Description  Updates an existing user
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id     path      string                  true  "User ID"
// @Param        input  body      models.UpdateUserInput  true  "User update (PATCH fields)"
// @Success      200   {object}  models.User
// @Failure      400   {string}  string "Bad Request"
// @Failure      500   {string}  string "Internal Server Error"
// @Router       /users/{id} [patch]
func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var input models.UpdateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.UpdateUser(id, &input); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, user)
}

type AssignUnitRequest struct {
	UnitID      string   `json:"unitId"`
	Permissions []string `json:"permissions"`
}

// AssignUnit godoc
// @Summary      Assign unit to user
// @Description  Assigns a unit to a user with optional permissions
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id       path      string             true  "User ID"
// @Param        request  body      AssignUnitRequest  true  "Assign Request"
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string "Bad Request"
// @Failure      500      {string}  string "Internal Server Error"
// @Router       /users/{id}/units/assign [post]
func (h *UserHandler) AssignUnit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req AssignUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.AssignUnit(id, req.UnitID, req.Permissions); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, map[string]bool{"success": true})
}

type RemoveUnitRequest struct {
	UnitID string `json:"unitId"`
}

// RemoveUnit godoc
// @Summary      Remove unit from user
// @Description  Removes a unit from a user
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id       path      string             true  "User ID"
// @Param        request  body      RemoveUnitRequest  true  "Remove Request"
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string "Bad Request"
// @Failure      500      {string}  string "Internal Server Error"
// @Router       /users/{id}/units/remove [post]
func (h *UserHandler) RemoveUnit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req RemoveUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.RemoveUnit(id, req.UnitID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, map[string]bool{"success": true})
}

// GetUserUnits godoc
// @Summary      Get user units
// @Description  Retrieves units assigned to a user
// @Tags         users
// @Produce      json
// @Param        id   path      string  true  "User ID"
// @Success      200  {array}   models.Unit
// @Failure      404  {string}  string "User not found"
// @Router       /users/{id}/units [get]
func (h *UserHandler) GetUserUnits(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.service.GetUserByID(id)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, user.Units)
}

// GetSystemStatus godoc
// @Summary      Get system status
// @Description  Checks if the system is initialized (has users)
// @Tags         system
// @Produce      json
// @Success      200  {object}  map[string]bool
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /system/status [get]
func (h *UserHandler) GetSystemStatus(w http.ResponseWriter, r *http.Request) {
	initialized, err := h.service.IsSystemInitialized()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, map[string]bool{"initialized": initialized})
}

type setupFirstAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SetupFirstAdmin godoc
// @Summary      Setup first admin
// @Description  Creates the first administrator if the system is not initialized
// @Tags         system
// @Accept       json
// @Produce      json
// @Param        request body setupFirstAdminRequest true "Admin user"
// @Success      201  {object}  models.User
// @Failure      400  {string}  string "Bad Request"
// @Failure      403  {string}  string "Forbidden - System already initialized"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /system/setup [post]
func (h *UserHandler) SetupFirstAdmin(w http.ResponseWriter, r *http.Request) {
	var req setupFirstAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "name, email and password are required", http.StatusBadRequest)
		return
	}
	email := req.Email
	plainPassword := req.Password
	user := models.User{
		Name:     req.Name,
		Email:    &email,
		Password: &plainPassword,
	}

	if err := h.service.CreateFirstAdmin(&user); err != nil {
		if err.Error() == "system is already initialized" {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, user)
}
