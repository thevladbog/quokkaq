import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SocketClient } from './socket';

vi.mock('./logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn()
  }
}));

function installMockWebSocket(
  factory: () => {
    readyState: number;
    close: ReturnType<typeof vi.fn>;
    onopen: (() => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onclose: (() => void) | null;
    addEventListener: ReturnType<typeof vi.fn>;
  }
) {
  type MockWebSocketCtor = {
    new (...args: unknown[]): unknown;
    CONNECTING: number;
    OPEN: number;
    CLOSING: number;
    CLOSED: number;
  };

  const Mock = vi.fn(function MockWebSocket(this: unknown) {
    return factory();
  }) as unknown as MockWebSocketCtor;
  Mock.CONNECTING = 0;
  Mock.OPEN = 1;
  Mock.CLOSING = 2;
  Mock.CLOSED = 3;
  vi.stubGlobal('WebSocket', Mock as unknown as typeof WebSocket);
  return Mock as unknown as typeof WebSocket;
}

describe('SocketClient.disconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not call close() while CONNECTING; closes after open (Strict Mode cleanup)', () => {
    const close = vi.fn();
    const addEventListener = vi.fn();

    installMockWebSocket(() => ({
      readyState: WebSocket.CONNECTING,
      close,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      addEventListener
    }));

    const client = new SocketClient();
    client.connect('unit-a');

    client.disconnect();

    expect(close).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith(
      'open',
      expect.any(Function),
      { once: true }
    );

    const onOpen = addEventListener.mock.calls.find(
      (c) => c[0] === 'open'
    )?.[1] as (() => void) | undefined;
    expect(onOpen).toBeTypeOf('function');
    onOpen?.();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('calls close() when socket is already OPEN', () => {
    const close = vi.fn();

    installMockWebSocket(() => ({
      readyState: WebSocket.OPEN,
      close,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      addEventListener: vi.fn()
    }));

    const client = new SocketClient();
    client.connect('unit-b');
    client.disconnect();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('disconnect() returns early without throwing when socket was never connected', () => {
    const client = new SocketClient();
    expect(() => client.disconnect()).not.toThrow();
  });

  it.each([
    { state: 'CLOSING', readyState: WebSocket.CLOSING },
    { state: 'CLOSED', readyState: WebSocket.CLOSED }
  ])(
    'disconnect() does not call socket.close() when readyState is $state',
    ({ readyState }) => {
      const close = vi.fn();

      installMockWebSocket(() => ({
        readyState,
        close,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        addEventListener: vi.fn()
      }));

      const client = new SocketClient();
      client.connect('unit-edge');
      client.disconnect();

      expect(close).not.toHaveBeenCalled();
    }
  );
});
