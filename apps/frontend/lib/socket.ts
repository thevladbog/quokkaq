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

export class SocketClient {
  private socket: WebSocket | null = null;
  private unitId: string | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitDisconnect = false;

  connect(unitId: string) {
    this.unitId = unitId;
    this.isExplicitDisconnect = false;

    // If the socket is already open, we must send a new subscribe. Otherwise initSocket()
    // bails out early, the hub keeps the client in the old room only, but this.unitId is
    // already updated — ticket events then get filtered out (data.unitId !== this.unitId).
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(
          JSON.stringify({
            action: 'subscribe',
            unitId
          })
        );
      } catch (e) {
        logger.error('WebSocket subscribe send failed:', e);
      }
      return;
    }

    this.initSocket();
  }

  private initSocket() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const baseWs = WS_BASE_URL.replace(/^http/, 'ws') + '/ws';
    let tokenQs = '';
    if (typeof window !== 'undefined') {
      try {
        const t = window.localStorage.getItem('access_token');
        if (t) {
          tokenQs = `?access_token=${encodeURIComponent(t)}`;
        }
      } catch {
        /* ignore */
      }
    }
    const wsUrl = baseWs + tokenQs;
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
        const dataUnitId =
          data && typeof data === 'object' && 'unitId' in data
            ? (data as { unitId?: string }).unitId
            : undefined;
        const filteredOut = Boolean(
          this.unitId && dataUnitId && dataUnitId !== this.unitId
        );
        if (filteredOut) {
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
      // Do not call close() here: while CONNECTING it makes Chrome log
      // "WebSocket is closed before the connection is established". onclose runs next and handles retry.
      logger.error('WebSocket connection issue (will retry):', error);
    };
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const s = this.socket;
    if (!s) return;

    // React Strict Mode runs effect cleanup while the socket may still be CONNECTING.
    // Calling close() in that state makes Chrome log "closed before the connection is established".
    if (s.readyState === WebSocket.CONNECTING) {
      this.socket = null;
      s.onopen = null;
      s.onmessage = null;
      s.onerror = null;
      s.onclose = null;
      s.addEventListener('open', () => s.close(), { once: true });
      return;
    }

    this.socket = null;
    if (s.readyState === WebSocket.OPEN) {
      s.close();
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
