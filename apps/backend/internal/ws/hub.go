package ws

import (
	"context"
	"encoding/json"
	"quokkaq-go-backend/internal/logger"
	"sync"
	"time"
)

const activeRoomsQueryTimeout = time.Second

type activeRoomsRequest struct {
	reply chan []string
}

type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Rooms (Unit IDs) -> Clients
	rooms map[string]map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan BroadcastMessage

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	// Subscribe client to a room
	subscribe chan Subscription

	// activeRoomsQuery requests a snapshot of rooms that have at least one client.
	activeRoomsQuery chan activeRoomsRequest

	quit     chan struct{}
	stopOnce sync.Once

	// BroadcastHook is optional; used in tests to observe BroadcastEvent calls (nil in production).
	BroadcastHook func(event, roomID string)
}

type BroadcastMessage struct {
	RoomID  string // Optional: if empty, broadcast to all (or handle as needed)
	Message []byte
}

type Subscription struct {
	Client *Client
	RoomID string
}

func NewHub() *Hub {
	return &Hub{
		broadcast:        make(chan BroadcastMessage),
		register:         make(chan *Client),
		unregister:       make(chan *Client),
		subscribe:        make(chan Subscription),
		clients:          make(map[*Client]bool),
		rooms:            make(map[string]map[*Client]bool),
		activeRoomsQuery: make(chan activeRoomsRequest),
		quit:             make(chan struct{}),
	}
}

// Stop ends the hub loop; safe to call once from shutdown or tests.
func (h *Hub) Stop() {
	if h == nil {
		return
	}
	h.stopOnce.Do(func() { close(h.quit) })
}

func (h *Hub) Run() {
	for {
		select {
		case <-h.quit:
			return
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				// Remove from all rooms
				for _, clients := range h.rooms {
					delete(clients, client)
				}
				delete(h.clients, client)
				close(client.send)
			}
		case sub := <-h.subscribe:
			if h.rooms[sub.RoomID] == nil {
				h.rooms[sub.RoomID] = make(map[*Client]bool)
			}
			h.rooms[sub.RoomID][sub.Client] = true

		case req := <-h.activeRoomsQuery:
			ids := make([]string, 0, len(h.rooms))
			for roomID, clients := range h.rooms {
				if len(clients) > 0 {
					ids = append(ids, roomID)
				}
			}
			req.reply <- ids

		case message := <-h.broadcast:
			if message.RoomID != "" {
				// Broadcast to specific room
				if clients, ok := h.rooms[message.RoomID]; ok {
					for client := range clients {
						select {
						case client.send <- message.Message:
						default:
							close(client.send)
							delete(h.clients, client)
							delete(clients, client)
						}
					}
				}
			} else {
				// Broadcast to all
				for client := range h.clients {
					select {
					case client.send <- message.Message:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
		}
	}
}

func (h *Hub) BroadcastEvent(event string, data interface{}, roomID string) {
	if h.BroadcastHook != nil {
		h.BroadcastHook(event, roomID)
	}
	msg := map[string]interface{}{
		"event": event,
		"data":  data,
	}
	bytes, err := json.Marshal(msg)
	if err != nil {
		logger.Println("Error marshaling broadcast message:", err)
		return
	}
	h.broadcast <- BroadcastMessage{
		RoomID:  roomID,
		Message: bytes,
	}
}

// ActiveRooms returns a snapshot of unit IDs (room IDs) that currently have
// at least one connected WebSocket subscriber. Safe to call from any goroutine.
// Returns nil if the hub loop is unavailable within the timeout.
func (h *Hub) ActiveRooms() []string {
	ctx, cancel := context.WithTimeout(context.Background(), activeRoomsQueryTimeout)
	defer cancel()

	reply := make(chan []string, 1)
	select {
	case h.activeRoomsQuery <- activeRoomsRequest{reply: reply}:
	case <-ctx.Done():
		logger.Println("Timed out requesting active websocket rooms:", ctx.Err())
		return nil
	}

	select {
	case rooms := <-reply:
		return rooms
	case <-ctx.Done():
		logger.Println("Timed out waiting for active websocket rooms:", ctx.Err())
		return nil
	}
}
