import { vi } from 'vitest';

const listeners = new Map<string, Set<(...args: any[]) => void>>();

export const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (...args: any[]) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
  }),
  off: vi.fn((event: string, handler: (...args: any[]) => void) => {
    listeners.get(event)?.delete(handler);
  }),
  connected: true,
  disconnect: vi.fn(),
};

export function __simulateEvent(event: string, ...args: any[]) {
  listeners.get(event)?.forEach((handler) => handler(...args));
}

export function __clearListeners() {
  listeners.clear();
}

export const socketService = {
  connect: vi.fn().mockReturnValue(mockSocket),
  disconnect: vi.fn(),
  getSocket: vi.fn().mockReturnValue(mockSocket),
};

vi.mock('@/services/socketService', () => ({
  socketService,
}));
