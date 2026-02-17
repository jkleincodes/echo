import { create } from 'zustand';
import { api, setApiToken } from '../lib/api';
import type { User } from '@shared/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  mfaRequired: boolean;
  mfaToken: string | null;

  login: (username: string, password: string, totpCode?: string) => Promise<{ token: string; user: User }>;
  verifyMfa: (totpCode: string) => Promise<{ token: string; user: User }>;
  clearMfa: () => void;
  register: (username: string, displayName: string, password: string, email?: string) => Promise<{ token: string; user: User }>;
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
        return { token: '', user: {} as User };
      }

      const { token, user } = data;
      localStorage.setItem('token', token);
      setApiToken(token);
      set({ user, token, isLoading: false, mfaRequired: false, mfaToken: null });
      return { token, user };
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Login failed', isLoading: false });
      throw err;
    }
  },

  verifyMfa: async (totpCode) => {
    const { mfaToken } = useAuthStore.getState();
    if (!mfaToken) throw new Error('No MFA session');
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/api/auth/login/mfa', { mfaToken, totpCode });
      const { token, user } = res.data.data;
      localStorage.setItem('token', token);
      setApiToken(token);
      set({ user, token, isLoading: false, mfaRequired: false, mfaToken: null });
      return { token, user };
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
      localStorage.setItem('token', token);
      setApiToken(token);
      set({ user, token, isLoading: false });
      return { token, user };
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Registration failed', isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    setApiToken(null);
    set({ user: null, token: null, mfaRequired: false, mfaToken: null });
  },

  hydrate: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setApiToken(token);
    try {
      const res = await api.get('/api/auth/me');
      const user = res.data.data;
      set({ token, user });
    } catch {
      localStorage.removeItem('token');
      setApiToken(null);
    }
  },
}));
