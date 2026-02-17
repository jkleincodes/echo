import { create } from 'zustand';
import { api, setApiToken } from '../lib/api';
import { socketService } from '../services/socketService';
import type { User } from '../../../../shared/types';
import { useMessageStore } from './messageStore';
import { useServerStore } from './serverStore';
import { useDMStore } from './dmStore';
import { useFriendStore } from './friendStore';
import { usePresenceStore } from './presenceStore';
import { useTypingStore } from './typingStore';
import { useUnreadStore } from './unreadStore';
import { useVoiceStore } from './voiceStore';
import { useNotificationStore } from './notificationStore';

declare global {
  interface Window {
    secureStorage?: {
      set: (token: string) => Promise<boolean>;
      get: () => Promise<string | null>;
      delete: () => Promise<boolean>;
    };
  }
}

async function storeToken(token: string): Promise<void> {
  if (window.secureStorage) {
    const stored = await window.secureStorage.set(token);
    if (stored) return;
  }
  // Fallback to localStorage if secureStorage unavailable
  localStorage.setItem('token', token);
}

async function retrieveToken(): Promise<string | null> {
  if (window.secureStorage) {
    const token = await window.secureStorage.get();
    if (token) return token;
  }
  return localStorage.getItem('token');
}

async function removeToken(): Promise<void> {
  if (window.secureStorage) {
    await window.secureStorage.delete();
  }
  localStorage.removeItem('token');
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  mfaRequired: boolean;
  mfaToken: string | null;

  login: (username: string, password: string, totpCode?: string) => Promise<void>;
  verifyMfa: (totpCode: string) => Promise<void>;
  clearMfa: () => void;
  register: (username: string, displayName: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  mfaRequired: false,
  mfaToken: null,

  login: async (username, password, totpCode) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/api/auth/login', { username, password, totpCode });
      const data = res.data.data;

      // MFA challenge
      if (data.mfaRequired) {
        set({ mfaRequired: true, mfaToken: data.mfaToken, isLoading: false });
        return;
      }

      const { token, user } = data;
      await storeToken(token);
      setApiToken(token);
      socketService.connect(token);
      set({ user, token, isLoading: false, mfaRequired: false, mfaToken: null });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Login failed', isLoading: false });
      throw err;
    }
  },

  verifyMfa: async (totpCode) => {
    const { mfaToken } = useAuthStore.getState();
    if (!mfaToken) return;
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/api/auth/login/mfa', { mfaToken, totpCode });
      const { token, user } = res.data.data;
      await storeToken(token);
      setApiToken(token);
      socketService.connect(token);
      set({ user, token, isLoading: false, mfaRequired: false, mfaToken: null });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Invalid code', isLoading: false });
      throw err;
    }
  },

  clearMfa: () => {
    set({ mfaRequired: false, mfaToken: null, error: null });
  },

  register: async (username, displayName, password, email) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/api/auth/register', { username, displayName, password, email });
      const { token, user } = res.data.data;
      await storeToken(token);
      setApiToken(token);
      socketService.connect(token);
      set({ user, token, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Registration failed', isLoading: false });
      throw err;
    }
  },

  logout: () => {
    removeToken();
    setApiToken(null);
    socketService.disconnect();

    // Reset all stores to prevent leaking data between accounts
    useMessageStore.getState().reset();
    useServerStore.getState().reset();
    useDMStore.getState().reset();
    useFriendStore.getState().reset();
    usePresenceStore.getState().reset();
    useTypingStore.getState().reset();
    useUnreadStore.getState().reset();
    useVoiceStore.getState().reset();
    useNotificationStore.getState().reset();

    set({ user: null, token: null, mfaRequired: false, mfaToken: null });
  },

  hydrate: async () => {
    const token = await retrieveToken();
    if (!token) return;

    setApiToken(token);
    try {
      const res = await api.get('/api/auth/me');
      const user = res.data.data;
      socketService.connect(token);
      set({ token, user });
    } catch {
      await removeToken();
      setApiToken(null);
    }
  },
}));
