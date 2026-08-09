import { io, Socket } from 'socket.io-client';
import type { TriagePayload } from '@optitriage/shared';

// Parse JWT without a library
export function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to parse JWT', err);
    return null;
  }
}

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
    socket = io(`${API_BASE_URL}/triage`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to triage socket');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err);
    });
  }
  return socket;
}

export function emitVitals(token: string, payload: TriagePayload) {
  const s = getSocket(token);
  s.emit('vitals', payload);
}
