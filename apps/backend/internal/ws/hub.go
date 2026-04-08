package ws

import (
	"encoding/json"
	"log"
)

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
		broadcast:  make(chan BroadcastMessage),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		subscribe:  make(chan Subscription),
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
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
	msg := map[string]interface{}{
		"event": event,
		"data":  data,
	}
	bytes, err := json.Marshal(msg)
	if err != nil {
		log.Println("Error marshaling broadcast message:", err)
		return
	}
	h.broadcast <- BroadcastMessage{
		RoomID:  roomID,
		Message: bytes,
	}
}
