import { create } from 'zustand';
import { api } from '../lib/api';
import type { DMChannel, DMMessage } from '../../../../shared/types';

interface DMState {
  channels: DMChannel[];
  activeDMChannelId: string | null;
  messages: Map<string, DMMessage[]>;
  cursors: Map<string, string | null>;
  loading: Map<string, boolean>;

  fetchChannels: () => Promise<void>;
  createOrGetChannel: (userId: string) => Promise<DMChannel>;
  setActiveDMChannel: (channelId: string | null) => void;
  fetchMessages: (channelId: string) => Promise<void>;
  fetchMore: (channelId: string) => Promise<void>;
  addMessage: (message: DMMessage) => void;
  updateMessage: (message: DMMessage) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  addChannel: (channel: DMChannel) => void;
  reset: () => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  channels: [],
  activeDMChannelId: null,
  messages: new Map(),
  cursors: new Map(),
  loading: new Map(),

  fetchChannels: async () => {
    try {
      const res = await api.get('/api/dms');
      set({ channels: res.data.data });
    } catch {}
  },

  createOrGetChannel: async (userId: string) => {
    const res = await api.post('/api/dms', { userId });
    const channel = res.data.data as DMChannel;
    set((s) => {
      if (s.channels.some((c) => c.id === channel.id)) return s;
      return { channels: [channel, ...s.channels] };
    });
    return channel;
  },

  setActiveDMChannel: (channelId) => {
    set({ activeDMChannelId: channelId });
  },

  fetchMessages: async (channelId) => {
    if (get().loading.get(channelId)) return;

    set((s) => {
      const loading = new Map(s.loading);
      loading.set(channelId, true);
      return { loading };
    });

    try {
      const res = await api.get(`/api/dms/${channelId}/messages`);
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

  fetchMore: async (channelId) => {
    const cursor = get().cursors.get(channelId);
    if (!cursor || get().loading.get(channelId)) return;

    set((s) => {
      const loading = new Map(s.loading);
      loading.set(channelId, true);
      return { loading };
    });

    try {
      const res = await api.get(`/api/dms/${channelId}/messages?cursor=${cursor}`);
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

      // Update last message in channel list
      const channels = s.channels.map((ch) =>
        ch.id === message.channelId ? { ...ch, lastMessage: message } : ch,
      );

      return { messages, channels };
    });
  },

  updateMessage: (message) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(message.channelId);
      if (!existing) return s;
      messages.set(
        message.channelId,
        existing.map((m) => (m.id === message.id ? message : m)),
      );
      return { messages };
    });
  },

  removeMessage: (channelId, messageId) => {
    set((s) => {
      const messages = new Map(s.messages);
      const existing = messages.get(channelId);
      if (!existing) return s;
      messages.set(
        channelId,
        existing.filter((m) => m.id !== messageId),
      );
      return { messages };
    });
  },

  addChannel: (channel) => {
    set((s) => {
      if (s.channels.some((c) => c.id === channel.id)) return s;
      return { channels: [channel, ...s.channels] };
    });
  },

  reset: () => {
    set({
      channels: [],
      activeDMChannelId: null,
      messages: new Map(),
      cursors: new Map(),
      loading: new Map(),
    });
  },
}));
