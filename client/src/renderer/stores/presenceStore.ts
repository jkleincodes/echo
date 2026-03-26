import { create } from 'zustand';
import type { UserStatus } from '../../../../shared/types';

interface PresenceState {
  userStatuses: Map<string, UserStatus>;
  setUserStatuses: (statuses: Record<string, UserStatus>) => void;
  setUserStatus: (userId: string, status: UserStatus) => void;
  removeUser: (userId: string) => void;
  getStatus: (userId: string) => UserStatus;
  isOnline: (userId: string) => boolean;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  userStatuses: new Map(),

  setUserStatuses: (statuses) => {
    set({ userStatuses: new Map(Object.entries(statuses)) });
  },

  setUserStatus: (userId, status) => {
    set((s) => {
      const userStatuses = new Map(s.userStatuses);
      if (status === 'offline') {
        userStatuses.delete(userId);
      } else {
        userStatuses.set(userId, status);
      }
      return { userStatuses };
    });
  },

  removeUser: (userId) => {
    set((s) => {
      const userStatuses = new Map(s.userStatuses);
      userStatuses.delete(userId);
      return { userStatuses };
    });
  },

  getStatus: (userId) => {
    return get().userStatuses.get(userId) ?? 'offline';
  },

  isOnline: (userId) => {
    return get().userStatuses.has(userId);
  },

  reset: () => {
    set({ userStatuses: new Map() });
  },
}));
