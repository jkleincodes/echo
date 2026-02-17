import { create } from 'zustand';

interface TypingUser {
  userId: string;
  username: string;
  timeout: ReturnType<typeof setTimeout>;
}

interface TypingState {
  typing: Map<string, Map<string, TypingUser>>; // channelId -> Map<userId, TypingUser>

  addTyping: (channelId: string, userId: string, username: string) => void;
  removeTyping: (channelId: string, userId: string) => void;
  getTypingUsers: (channelId: string) => { userId: string; username: string }[];
  reset: () => void;
}

const TYPING_DISPLAY_TIMEOUT = 6000;

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: new Map(),

  addTyping: (channelId, userId, username) => {
    set((s) => {
      const typing = new Map(s.typing);
      if (!typing.has(channelId)) {
        typing.set(channelId, new Map());
      }
      const channelTyping = new Map(typing.get(channelId)!);

      // Clear existing timeout
      const existing = channelTyping.get(userId);
      if (existing) clearTimeout(existing.timeout);

      // Set auto-clear timeout
      const timeout = setTimeout(() => {
        get().removeTyping(channelId, userId);
      }, TYPING_DISPLAY_TIMEOUT);

      channelTyping.set(userId, { userId, username, timeout });
      typing.set(channelId, channelTyping);
      return { typing };
    });
  },

  removeTyping: (channelId, userId) => {
    set((s) => {
      const typing = new Map(s.typing);
      const channelTyping = typing.get(channelId);
      if (!channelTyping) return s;

      const existing = channelTyping.get(userId);
      if (existing) clearTimeout(existing.timeout);

      const newChannelTyping = new Map(channelTyping);
      newChannelTyping.delete(userId);
      if (newChannelTyping.size === 0) {
        typing.delete(channelId);
      } else {
        typing.set(channelId, newChannelTyping);
      }
      return { typing };
    });
  },

  getTypingUsers: (channelId) => {
    const channelTyping = get().typing.get(channelId);
    if (!channelTyping) return [];
    return Array.from(channelTyping.values()).map((t) => ({
      userId: t.userId,
      username: t.username,
    }));
  },

  reset: () => {
    // Clear all pending timeouts before resetting
    const { typing } = get();
    for (const channelTyping of typing.values()) {
      for (const user of channelTyping.values()) {
        clearTimeout(user.timeout);
      }
    }
    set({ typing: new Map() });
  },
}));
