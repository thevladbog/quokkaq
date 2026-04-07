import { Ticket } from './api';
import { logger } from './logger';

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export interface TicketUpdate {
  ticket: Ticket;
}

export interface QueueSnapshot {
  unitId: string;
  now: string;
  tickets: Ticket[];
}

type Listener = (data: unknown) => void;

class SocketClient {
  private socket: WebSocket | null = null;
  private unitId: string | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitDisconnect = false;

  connect(unitId: string) {
    this.unitId = unitId;
    this.isExplicitDisconnect = false;
    this.initSocket();
  }

  private initSocket() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const wsUrl = WS_BASE_URL.replace(/^http/, 'ws') + '/ws';
    logger.log('Connecting to WebSocket:', wsUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      logger.log('Connected to WebSocket');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Subscribe to unit room if unitId is set
      if (this.unitId) {
        this.socket?.send(
          JSON.stringify({
            action: 'subscribe',
            unitId: this.unitId
          })
        );
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { event: eventName, data } = message;

        // Filter by unitId if applicable
        // Backend now handles room-based broadcasting, but we can keep this as a safety check
        if (this.unitId && data?.unitId && data.unitId !== this.unitId) {
          // console.warn('Received message for different unit:', data.unitId);
          return;
        }

        let payload = data;
        if (eventName.startsWith('ticket.')) {
          payload = { ticket: data };
        }

        this.dispatch(eventName, payload);
      } catch (e) {
        logger.error('Failed to parse WebSocket message:', e);
      }
    };

    this.socket.onclose = () => {
      logger.log('Disconnected from WebSocket');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.socket = null;
      if (!this.isExplicitDisconnect) {
        this.reconnectTimer = setTimeout(() => this.initSocket(), 3000);
      }
    };

    this.socket.onerror = (error) => {
      // Connection failures also trigger onclose/retry; still log at error so production sees them.
      logger.error('WebSocket connection issue (will retry):', error);
      this.socket?.close();
    };
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private dispatch(event: string, data: unknown) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  // Event listeners
  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off(event: string, callback?: Listener) {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  // Specific typed helpers matching previous interface
  onTicketCreated(callback: (data: TicketUpdate) => void) {
    this.on('ticket.created', (data) => callback(data as TicketUpdate));
  }

  onTicketUpdated(callback: (data: TicketUpdate) => void) {
    this.on('ticket.updated', (data) => callback(data as TicketUpdate));
  }

  onTicketCalled(callback: (data: TicketUpdate) => void) {
    this.on('ticket.called', (data) => callback(data as TicketUpdate));
  }

  onQueueSnapshot(callback: (data: QueueSnapshot) => void) {
    this.on('queue.snapshot', (data) => callback(data as QueueSnapshot));
  }

  onSystemAlert(
    callback: (data: { message: string; severity: string }) => void
  ) {
    this.on('system.alert', (data) =>
      callback(data as { message: string; severity: string })
    );
  }

  onUnitEOD(
    callback: (data: {
      unitId: string;
      ticketsMarked: number;
      countersReleased: number;
    }) => void
  ) {
    this.on('unit.eod', (data) =>
      callback(
        data as {
          unitId: string;
          ticketsMarked: number;
          countersReleased: number;
        }
      )
    );
  }

  // Emit events - Backend currently doesn't handle these, but keeping for compatibility
  emitScreenReady() {
    // this.socket?.send(JSON.stringify({ event: 'screen.ready' }));
  }

  emitKioskReady() {
    // this.socket?.send(JSON.stringify({ event: 'kiosk.ready' }));
  }
}

export const socketClient = new SocketClient();
