import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../lib/serverUrl';

class SocketService {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket) return this.socket;

    this.socket = io(getServerUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected');
      // On reconnect, request a full voice state sync to recover from missed events
      if (this.socket?.recovered === false) {
        this.socket.emit('voice:request-sync');
      }
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
