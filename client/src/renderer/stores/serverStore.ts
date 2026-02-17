import { create } from 'zustand';
import { api } from '../lib/api';
import type { Server, Channel, Member, ChannelCategory, Role, User } from '../../../../shared/types';

interface ServerState {
  servers: Server[];
  activeServerId: string | null;
  channels: Channel[];
  categories: ChannelCategory[];
  members: Member[];
  roles: Role[];
  activeChannelId: string | null;
  showHome: boolean; // true = show DM/Friends view

  fetchServers: () => Promise<void>;
  fetchServerDetails: (serverId: string) => Promise<void>;
  createServer: (name: string) => Promise<Server>;
  setActiveServer: (serverId: string) => void;
  setActiveChannel: (channelId: string) => void;
  setShowHome: (show: boolean) => void;
  createChannel: (serverId: string, name: string, type: 'text' | 'voice', categoryId?: string) => Promise<Channel>;
  addChannel: (channel: Channel) => void;
  updateChannel: (channel: Channel) => void;
  addMember: (member: Member) => void;
  removeMember: (userId: string) => void;
  updateServer: (server: Server) => void;
  updateMemberUser: (user: User) => void;
  createCategory: (serverId: string, name: string) => Promise<ChannelCategory>;
  updateCategory: (serverId: string, categoryId: string, data: { name?: string }) => Promise<void>;
  deleteCategory: (serverId: string, categoryId: string) => Promise<void>;
  deleteChannel: (serverId: string, channelId: string) => Promise<void>;
  removeChannel: (channelId: string) => void;
  reorderChannels: (serverId: string, updates: { id: string; position: number; categoryId: string | null }[]) => Promise<void>;
  setChannels: (channels: Channel[]) => void;
  reset: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  channels: [],
  categories: [],
  members: [],
  roles: [],
  activeChannelId: null,
  showHome: false,

  fetchServers: async () => {
    const res = await api.get('/api/servers');
    set({ servers: res.data.data });
  },

  fetchServerDetails: async (serverId: string) => {
    const res = await api.get(`/api/servers/${serverId}`);
    const server = res.data.data;
    set({
      channels: server.channels,
      categories: server.categories || [],
      members: server.members,
      roles: server.roles || [],
    });
    // Auto-select first text channel
    const textChannels = server.channels.filter((c: Channel) => c.type === 'text');
    if (textChannels.length > 0 && !get().activeChannelId) {
      set({ activeChannelId: textChannels[0].id });
    }
  },

  createServer: async (name: string) => {
    const res = await api.post('/api/servers', { name });
    const server = res.data.data;
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  setActiveServer: (serverId: string) => {
    set({ activeServerId: serverId, activeChannelId: null, channels: [], categories: [], members: [], roles: [], showHome: false });
    get().fetchServerDetails(serverId);
  },

  setActiveChannel: (channelId: string) => {
    set({ activeChannelId: channelId });
  },

  setShowHome: (show: boolean) => {
    set({ showHome: show, activeServerId: show ? null : get().activeServerId });
  },

  createChannel: async (serverId: string, name: string, type: 'text' | 'voice', categoryId?: string) => {
    const res = await api.post(`/api/servers/${serverId}/channels`, { name, type, categoryId });
    const channel = res.data.data;
    set((s) => ({ channels: [...s.channels, channel] }));
    return channel;
  },

  addChannel: (channel: Channel) => {
    set((s) => {
      if (s.channels.some((c) => c.id === channel.id)) return s;
      return { channels: [...s.channels, channel] };
    });
  },

  updateChannel: (channel: Channel) => {
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channel.id ? { ...c, ...channel } : c)),
    }));
  },

  addMember: (member: Member) => {
    set((s) => {
      if (s.members.some((m) => m.id === member.id)) return s;
      return { members: [...s.members, member] };
    });
  },

  removeMember: (userId: string) => {
    set((s) => ({ members: s.members.filter((m) => m.userId !== userId) }));
  },

  updateServer: (server: Server) => {
    set((s) => ({
      servers: s.servers.map((srv) => (srv.id === server.id ? { ...srv, ...server } : srv)),
    }));
  },

  updateMemberUser: (user: User) => {
    set((s) => ({
      members: s.members.map((m) =>
        m.userId === user.id ? { ...m, user: { ...m.user, ...user } } : m,
      ),
    }));
  },

  createCategory: async (serverId: string, name: string) => {
    const res = await api.post(`/api/servers/${serverId}/categories`, { name });
    const category = res.data.data;
    set((s) => ({ categories: [...s.categories, category] }));
    return category;
  },

  updateCategory: async (serverId: string, categoryId: string, data: { name?: string }) => {
    const res = await api.patch(`/api/servers/${serverId}/categories/${categoryId}`, data);
    const updated = res.data.data;
    set((s) => ({
      categories: s.categories.map((c) => (c.id === categoryId ? { ...c, ...updated } : c)),
    }));
  },

  deleteCategory: async (serverId: string, categoryId: string) => {
    await api.delete(`/api/servers/${serverId}/categories/${categoryId}`);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== categoryId),
      channels: s.channels.map((ch) =>
        ch.categoryId === categoryId ? { ...ch, categoryId: null } : ch,
      ),
    }));
  },

  deleteChannel: async (serverId: string, channelId: string) => {
    await api.delete(`/api/servers/${serverId}/channels/${channelId}`);
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      activeChannelId: s.activeChannelId === channelId ? null : s.activeChannelId,
    }));
  },

  removeChannel: (channelId: string) => {
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      activeChannelId: s.activeChannelId === channelId ? null : s.activeChannelId,
    }));
  },

  reorderChannels: async (serverId: string, updates: { id: string; position: number; categoryId: string | null }[]) => {
    const previousChannels = get().channels;
    // Optimistic update
    set((s) => ({
      channels: s.channels.map((ch) => {
        const update = updates.find((u) => u.id === ch.id);
        return update ? { ...ch, position: update.position, categoryId: update.categoryId } : ch;
      }),
    }));
    try {
      await api.patch(`/api/servers/${serverId}/channels/reorder`, { channels: updates });
    } catch {
      // Rollback on failure
      set({ channels: previousChannels });
    }
  },

  setChannels: (channels: Channel[]) => {
    set((s) => ({
      channels: s.channels.map((ch) => {
        const updated = channels.find((u) => u.id === ch.id);
        return updated ? { ...ch, ...updated } : ch;
      }),
    }));
  },

  reset: () => {
    set({
      servers: [],
      activeServerId: null,
      channels: [],
      categories: [],
      members: [],
      roles: [],
      activeChannelId: null,
      showHome: false,
    });
  },
}));
