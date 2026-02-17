import { create } from 'zustand';
import { api } from '../lib/api';
import type { Message, Reaction, Embed } from '../../../../shared/types';

interface MessageState {
  messages: Map<string, Message[]>; // channelId -> messages
  cursors: Map<string, string | null>; // channelId -> nextCursor
  loading: Map<string, boolean>;
  replyingTo: Message | null;

  // Search
  searchResults: Message[];
  searchLoading: boolean;
  searchCursor: string | null;

  fetchMessages: (serverId: string, channelId: string) => Promise<void>;
  fetchMore: (serverId: string, channelId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string, channelId: string) => void;
  updateMessage: (message: Message) => void;
  updateReactions: (messageId: string, channelId: string, reactions: Reaction[]) => void;
  updateEmbeds: (messageId: string, channelId: string, embeds: Embed[]) => void;
  setReplyingTo: (message: Message | null) => void;
  pinMessage: (message: Message) => void;
  unpinMessage: (messageId: string, channelId: string) => void;

  // Search
  searchMessages: (serverId: string, query: string, channelId?: string, authorId?: string) => Promise<void>;
  clearSearch: () => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  cursors: new Map(),
  loading: new Map(),
  replyingTo: null,

  searchResults: [],
  searchLoading: false,
  searchCursor: null,

  fetchMessages: async (serverId, channelId) => {
    if (get().loading.get(channelId)) return;

    set((s) => {
      const loading = new Map(s.loading);
      loading.set(channelId, true);
      return { loading };
    });

    try {
      const res = await api.get(`/api/servers/${serverId}/channels/${channelId}/messages`);
      const { data, nextCursor } = res.data;

      set((s) => {
        const messages = new Map(s.messages);
        const cursors = new Map(s.cursors);
        const loading = new Map(s.loading);
        messages.set(channelId, data.reverse());
        cursors.set(channelId, nextCursor);
        loading.set(channelId, false);
        return { messages, cursors, loading };
      });
    } catch {
      set((s) => {
        const loading = new Map(s.loading);
        loading.set(channelId, false);
        return { loading };
      });
    }
  },

  fetchMore: async (serverId, channelId) => {
    const cursor = get().cursors.get(channelId);
    if (!cursor || get().loading.get(channelId)) return;

    set((s) => {
      const loading = new Map(s.loading);
      loading.set(channelId, true);
      return { loading };
    });

    try {
      const res = await api.get(`/api/servers/${serverId}/channels/${channelId}/messages?cursor=${cursor}`);
      const { data, nextCursor } = res.data;

      set((s) => {
        const messages = new Map(s.messages);
        const cursors = new Map(s.cursors);
        const loading = new Map(s.loading);
        const existing = messages.get(channelId) || [];
        messages.set(channelId, [...data.reverse(), ...existing]);
        cursors.set(channelId, nextCursor);
        loading.set(channelId, false);
        return { messages, cursors, loading };
      });
    } catch {
      set((s) => {
        const loading = new Map(s.loading);
        loading.set(channelId, false);
        return { loading };
      });
    }
  },

  addMessage: (message) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(message.channelId) || [];
      messages.set(message.channelId, [...existing, message]);
      return { messages };
    });
  },

  removeMessage: (messageId, channelId) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(channelId) || [];
      messages.set(channelId, existing.filter((m) => m.id !== messageId));
      return { messages };
    });
  },

  updateMessage: (message) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(message.channelId) || [];
      messages.set(
        message.channelId,
        existing.map((m) => (m.id === message.id ? message : m)),
      );
      return { messages };
    });
  },

  updateReactions: (messageId, channelId, reactions) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(channelId) || [];
      messages.set(
        channelId,
        existing.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      );
      return { messages };
    });
  },

  updateEmbeds: (messageId, channelId, embeds) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(channelId) || [];
      messages.set(
        channelId,
        existing.map((m) => (m.id === messageId ? { ...m, embeds } : m)),
      );
      return { messages };
    });
  },

  setReplyingTo: (message) => {
    set({ replyingTo: message });
  },

  pinMessage: (message) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(message.channelId) || [];
      messages.set(
        message.channelId,
        existing.map((m) => (m.id === message.id ? message : m)),
      );
      return { messages };
    });
  },

  unpinMessage: (messageId, channelId) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(channelId) || [];
      messages.set(
        channelId,
        existing.map((m) =>
          m.id === messageId ? { ...m, pinnedAt: null, pinnedById: null } : m,
        ),
      );
      return { messages };
    });
  },

  searchMessages: async (serverId, query, channelId, authorId) => {
    set({ searchLoading: true, searchResults: [], searchCursor: null });
    try {
      const params = new URLSearchParams({ q: query });
      if (channelId) params.set('channelId', channelId);
      if (authorId) params.set('authorId', authorId);
      const res = await api.get(`/api/servers/${serverId}/search?${params}`);
      set({
        searchResults: res.data.data,
        searchCursor: res.data.nextCursor,
        searchLoading: false,
      });
    } catch {
      set({ searchLoading: false });
    }
  },

  clearSearch: () => {
    set({ searchResults: [], searchCursor: null, searchLoading: false });
  },

  reset: () => {
    set({
      messages: new Map(),
      cursors: new Map(),
      loading: new Map(),
      replyingTo: null,
      searchResults: [],
      searchLoading: false,
      searchCursor: null,
    });
  },
}));
