import { create } from 'zustand';

interface UnreadInfo {
  count: number;
  mentionCount: number;
  serverId: string | null; // null = DM
}

interface UnreadState {
  unreads: Map<string, UnreadInfo>; // channelId -> unread info
  threadUnreads: Map<string, UnreadInfo>; // threadId -> unread info

  setUnread: (channelId: string, serverId: string | null, count: number, mentionCount: number, threadId?: string) => void;
  setBulkUnread: (items: Array<{ channelId: string; serverId: string | null; unreadCount: number; mentionCount: number; threadId?: string }>) => void;
  clearUnread: (channelId: string) => void;
  clearThreadUnread: (threadId: string) => void;
  getServerUnread: (serverId: string) => { totalCount: number; totalMentions: number };
  getDMUnread: () => { totalCount: number };
  getThreadUnreadCount: (threadId: string) => number;
  reset: () => void;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  unreads: new Map(),
  threadUnreads: new Map(),

  setUnread: (channelId, serverId, count, mentionCount, threadId) => {
    set((s) => {
      if (threadId) {
        const threadUnreads = new Map(s.threadUnreads);
        if (count === 0 && mentionCount === 0) {
          threadUnreads.delete(threadId);
        } else {
          threadUnreads.set(threadId, { count, mentionCount, serverId });
        }
        return { threadUnreads };
      }
      const unreads = new Map(s.unreads);
      if (count === 0 && mentionCount === 0) {
        unreads.delete(channelId);
      } else {
        unreads.set(channelId, { count, mentionCount, serverId });
      }
      return { unreads };
    });
  },

  setBulkUnread: (items) => {
    set((s) => {
      const unreads = new Map(s.unreads);
      const threadUnreads = new Map(s.threadUnreads);
      for (const item of items) {
        if (item.threadId) {
          if (item.unreadCount === 0 && item.mentionCount === 0) {
            threadUnreads.delete(item.threadId);
          } else {
            threadUnreads.set(item.threadId, {
              count: item.unreadCount,
              mentionCount: item.mentionCount,
              serverId: item.serverId,
            });
          }
        } else {
          if (item.unreadCount === 0 && item.mentionCount === 0) {
            unreads.delete(item.channelId);
          } else {
            unreads.set(item.channelId, {
              count: item.unreadCount,
              mentionCount: item.mentionCount,
              serverId: item.serverId,
            });
          }
        }
      }
      return { unreads, threadUnreads };
    });
  },

  clearUnread: (channelId) => {
    set((s) => {
      const unreads = new Map(s.unreads);
      unreads.delete(channelId);
      return { unreads };
    });
  },

  clearThreadUnread: (threadId) => {
    set((s) => {
      const threadUnreads = new Map(s.threadUnreads);
      threadUnreads.delete(threadId);
      return { threadUnreads };
    });
  },

  getServerUnread: (serverId) => {
    const unreads = get().unreads;
    let totalCount = 0;
    let totalMentions = 0;
    for (const [, info] of unreads) {
      if (info.serverId === serverId) {
        totalCount += info.count;
        totalMentions += info.mentionCount;
      }
    }
    return { totalCount, totalMentions };
  },

  getDMUnread: () => {
    const unreads = get().unreads;
    let totalCount = 0;
    for (const [, info] of unreads) {
      if (info.serverId === null) {
        totalCount += info.count;
      }
    }
    return { totalCount };
  },

  getThreadUnreadCount: (threadId) => {
    const info = get().threadUnreads.get(threadId);
    return info ? info.count : 0;
  },

  reset: () => {
    set({ unreads: new Map(), threadUnreads: new Map() });
  },
}));
