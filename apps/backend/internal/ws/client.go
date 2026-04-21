package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

var (
	wsAllowedOriginsMu sync.RWMutex
	wsAllowedOrigins   []string
)

// SetWebSocketAllowedOrigins sets allowed Origin header values for browser WebSocket upgrades.
// Call from main with the same list as HTTP CORS (e.g. CORS_ALLOWED_ORIGINS).
func SetWebSocketAllowedOrigins(origins []string) {
	wsAllowedOriginsMu.Lock()
	defer wsAllowedOriginsMu.Unlock()
	wsAllowedOrigins = append([]string(nil), origins...)
}

func checkWebSocketOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		// Non-browser clients may omit Origin.
		return true
	}
	wsAllowedOriginsMu.RLock()
	list := wsAllowedOrigins
	wsAllowedOriginsMu.RUnlock()
	for _, o := range list {
		if o == origin {
			return true
		}
	}
	return false
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkWebSocketOrigin,
}

// SubscribeAuthorizer returns whether the client may join the unit room (JWT context is on the client).
type SubscribeAuthorizer func(ctx context.Context, unitID string) bool

type Client struct {
	hub          *Hub
	conn         *websocket.Conn
	send         chan []byte
	reqCtx       context.Context
	canSubscribe SubscribeAuthorizer
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Printf("error: %v", err)
			}
			break
		}

		// Handle subscription (requires access to unit room)
		var msg map[string]string
		if err := json.Unmarshal(message, &msg); err == nil {
			if action, ok := msg["action"]; ok && action == "subscribe" {
				if unitID, ok := msg["unitId"]; ok {
					unitID = strings.TrimSpace(unitID)
					if unitID != "" && c.canSubscribe != nil && c.canSubscribe(c.reqCtx, unitID) {
						c.hub.subscribe <- Subscription{Client: c, RoomID: unitID}
					}
				}
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				return
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ServeWsAuthenticated upgrades after JWT validation; canSubscribe enforces unit room membership.
func ServeWsAuthenticated(hub *Hub, canSubscribe SubscribeAuthorizer, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Println(err)
		return
	}
	client := &Client{
		hub:          hub,
		conn:         conn,
		send:         make(chan []byte, 256),
		reqCtx:       r.Context(),
		canSubscribe: canSubscribe,
	}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

// ServeWs upgrades without auth (tests only).
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	ServeWsAuthenticated(hub, nil, w, r)
}
