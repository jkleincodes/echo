import { create } from 'zustand';
import { api } from '../lib/api';
import type { Thread, Message, Reaction, Embed } from '../../../../shared/types';

interface ThreadState {
  activeThread: Thread | null;
  threadMessages: Map<string, Message[]>;
  threadCursors: Map<string, string | null>;
  threadLoading: Map<string, boolean>;
  replyingToInThread: Message | null;
  channelThreads: Map<string, Thread[]>;

  openThread: (thread: Thread) => void;
  closeThread: () => void;
  fetchThreadMessages: (serverId: string, threadId: string) => Promise<void>;
  fetchMoreThreadMessages: (serverId: string, threadId: string) => Promise<void>;
  fetchChannelThreads: (serverId: string, channelId: string) => Promise<void>;
  addThreadMessage: (message: Message) => void;
  removeThreadMessage: (messageId: string, threadId: string) => void;
  updateThreadMessage: (message: Message) => void;
  updateThreadReactions: (messageId: string, threadId: string, reactions: Reaction[]) => void;
  updateThreadEmbeds: (messageId: string, threadId: string, embeds: Embed[]) => void;
  setReplyingToInThread: (message: Message | null) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => void;
  createThread: (serverId: string, channelId: string, messageId: string, name: string) => Promise<Thread | null>;
  reset: () => void;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  activeThread: null,
  threadMessages: new Map(),
  threadCursors: new Map(),
  threadLoading: new Map(),
  replyingToInThread: null,
  channelThreads: new Map(),

  openThread: (thread) => {
    set({ activeThread: thread });
  },

  closeThread: () => {
    set({ activeThread: null, replyingToInThread: null });
  },

  fetchThreadMessages: async (serverId, threadId) => {
    if (get().threadLoading.get(threadId)) return;

    set((s) => {
      const threadLoading = new Map(s.threadLoading);
      threadLoading.set(threadId, true);
      return { threadLoading };
    });

    try {
      const res = await api.get(`/api/servers/${serverId}/threads/${threadId}/messages`);
      const { data, nextCursor } = res.data;

      set((s) => {
        const threadMessages = new Map(s.threadMessages);
        const threadCursors = new Map(s.threadCursors);
        const threadLoading = new Map(s.threadLoading);
        threadMessages.set(threadId, data.reverse());
        threadCursors.set(threadId, nextCursor);
        threadLoading.set(threadId, false);
        return { threadMessages, threadCursors, threadLoading };
      });
    } catch {
      set((s) => {
        const threadLoading = new Map(s.threadLoading);
        threadLoading.set(threadId, false);
        return { threadLoading };
      });
    }
  },

  fetchMoreThreadMessages: async (serverId, threadId) => {
    const cursor = get().threadCursors.get(threadId);
    if (!cursor || get().threadLoading.get(threadId)) return;

    set((s) => {
      const threadLoading = new Map(s.threadLoading);
      threadLoading.set(threadId, true);
      return { threadLoading };
    });

    try {
      const res = await api.get(`/api/servers/${serverId}/threads/${threadId}/messages?cursor=${cursor}`);
      const { data, nextCursor } = res.data;

      set((s) => {
        const threadMessages = new Map(s.threadMessages);
        const threadCursors = new Map(s.threadCursors);
        const threadLoading = new Map(s.threadLoading);
        const existing = threadMessages.get(threadId) || [];
        threadMessages.set(threadId, [...data.reverse(), ...existing]);
        threadCursors.set(threadId, nextCursor);
        threadLoading.set(threadId, false);
        return { threadMessages, threadCursors, threadLoading };
      });
    } catch {
      set((s) => {
        const threadLoading = new Map(s.threadLoading);
        threadLoading.set(threadId, false);
        return { threadLoading };
      });
    }
  },

  fetchChannelThreads: async (serverId, channelId) => {
    try {
      const res = await api.get(`/api/servers/${serverId}/channels/${channelId}/threads`);
      set((s) => {
        const channelThreads = new Map(s.channelThreads);
        channelThreads.set(channelId, res.data.data);
        return { channelThreads };
      });
    } catch {
      // ignore
    }
  },

  addThreadMessage: (message) => {
    if (!message.threadId) return;
    set((s) => {
      const threadMessages = new Map(s.threadMessages);
      const existing = threadMessages.get(message.threadId!) || [];
      threadMessages.set(message.threadId!, [...existing, message]);
      return { threadMessages };
    });
  },

  removeThreadMessage: (messageId, threadId) => {
    set((s) => {
      const threadMessages = new Map(s.threadMessages);
      const existing = threadMessages.get(threadId) || [];
      threadMessages.set(threadId, existing.filter((m) => m.id !== messageId));
      return { threadMessages };
    });
  },

  updateThreadMessage: (message) => {
    if (!message.threadId) return;
    set((s) => {
      const threadMessages = new Map(s.threadMessages);
      const existing = threadMessages.get(message.threadId!) || [];
      threadMessages.set(
        message.threadId!,
        existing.map((m) => (m.id === message.id ? message : m)),
      );
      return { threadMessages };
    });
  },

  updateThreadReactions: (messageId, threadId, reactions) => {
    set((s) => {
      const threadMessages = new Map(s.threadMessages);
      const existing = threadMessages.get(threadId) || [];
      threadMessages.set(
        threadId,
        existing.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      );
      return { threadMessages };
    });
  },

  updateThreadEmbeds: (messageId, threadId, embeds) => {
    set((s) => {
      const threadMessages = new Map(s.threadMessages);
      const existing = threadMessages.get(threadId) || [];
      threadMessages.set(
        threadId,
        existing.map((m) => (m.id === messageId ? { ...m, embeds } : m)),
      );
      return { threadMessages };
    });
  },

  setReplyingToInThread: (message) => {
    set({ replyingToInThread: message });
  },

  updateThread: (threadId, updates) => {
    set((s) => {
      // Update active thread if it matches
      let activeThread = s.activeThread;
      if (activeThread && activeThread.id === threadId) {
        activeThread = { ...activeThread, ...updates };
      }

      // Update in channelThreads
      const channelThreads = new Map(s.channelThreads);
      for (const [channelId, threads] of channelThreads) {
        const idx = threads.findIndex((t) => t.id === threadId);
        if (idx >= 0) {
          const updated = [...threads];
          updated[idx] = { ...updated[idx], ...updates };
          channelThreads.set(channelId, updated);
          break;
        }
      }

      return { activeThread, channelThreads };
    });
  },

  createThread: async (serverId, channelId, messageId, name) => {
    try {
      const res = await api.post(`/api/servers/${serverId}/channels/${channelId}/threads`, {
        messageId,
        name,
      });
      const thread = res.data.data as Thread;
      set({ activeThread: thread });
      return thread;
    } catch (err) {
      console.error('Failed to create thread:', err);
      return null;
    }
  },

  reset: () => {
    set({
      activeThread: null,
      threadMessages: new Map(),
      threadCursors: new Map(),
      threadLoading: new Map(),
      replyingToInThread: null,
      channelThreads: new Map(),
    });
  },
}));
