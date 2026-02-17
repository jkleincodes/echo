import { create } from 'zustand';

interface PresenceState {
  onlineUsers: Set<string>;
  setOnlineUsers: (userIds: string[]) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),

  setOnlineUsers: (userIds) => {
    set({ onlineUsers: new Set(userIds) });
  },

  setUserOnline: (userId) => {
    set((s) => {
      const onlineUsers = new Set(s.onlineUsers);
      onlineUsers.add(userId);
      return { onlineUsers };
    });
  },

  setUserOffline: (userId) => {
    set((s) => {
      const onlineUsers = new Set(s.onlineUsers);
      onlineUsers.delete(userId);
      return { onlineUsers };
    });
  },

  reset: () => {
    set({ onlineUsers: new Set() });
  },
}));
