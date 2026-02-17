import { create } from 'zustand';
import { api } from '../lib/api';
import type { NotificationPreference, ChannelNotificationOverride, NotificationLevel, ChannelNotificationLevel } from '../../../../shared/types';

interface NotificationState {
  serverPreferences: Map<string, NotificationPreference>;
  channelOverrides: Map<string, ChannelNotificationOverride>;
  desktopNotificationsEnabled: boolean;

  fetchAll: () => Promise<void>;
  updateServerPreference: (serverId: string, data: {
    level?: NotificationLevel;
    muted?: boolean;
    mutedUntil?: string | null;
    suppressEveryone?: boolean;
    suppressHere?: boolean;
  }) => Promise<void>;
  updateChannelOverride: (serverId: string, channelId: string, data: {
    level?: ChannelNotificationLevel;
    muted?: boolean;
    mutedUntil?: string | null;
  }) => Promise<void>;
  removeChannelOverride: (serverId: string, channelId: string) => Promise<void>;
  isServerMuted: (serverId: string) => boolean;
  isChannelMuted: (channelId: string) => boolean;
  getEffectiveLevel: (serverId: string, channelId: string) => NotificationLevel;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
  reset: () => void;
}

function isMutedActive(muted: boolean, mutedUntil: string | null): boolean {
  if (!muted) return false;
  if (!mutedUntil) return true;
  return new Date() < new Date(mutedUntil);
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  serverPreferences: new Map(),
  channelOverrides: new Map(),
  desktopNotificationsEnabled: localStorage.getItem('desktopNotificationsEnabled') !== 'false',

  fetchAll: async () => {
    try {
      const res = await api.get('/api/notification-preferences');
      const { serverPreferences, channelOverrides } = res.data.data;

      const serverMap = new Map<string, NotificationPreference>();
      for (const pref of serverPreferences) {
        serverMap.set(pref.serverId, pref);
      }

      const channelMap = new Map<string, ChannelNotificationOverride>();
      for (const override of channelOverrides) {
        channelMap.set(override.channelId, override);
      }

      set({ serverPreferences: serverMap, channelOverrides: channelMap });
    } catch {
      // Silently fail on fetch — user just gets defaults
    }
  },

  updateServerPreference: async (serverId, data) => {
    const res = await api.put(`/api/servers/${serverId}/notification-preferences`, data);
    const pref = res.data.data as NotificationPreference;
    set((s) => {
      const serverPreferences = new Map(s.serverPreferences);
      serverPreferences.set(serverId, pref);
      return { serverPreferences };
    });
  },

  updateChannelOverride: async (serverId, channelId, data) => {
    const res = await api.put(`/api/servers/${serverId}/channels/${channelId}/notification-override`, data);
    const override = res.data.data as ChannelNotificationOverride;
    set((s) => {
      const channelOverrides = new Map(s.channelOverrides);
      channelOverrides.set(channelId, override);
      return { channelOverrides };
    });
  },

  removeChannelOverride: async (serverId, channelId) => {
    await api.delete(`/api/servers/${serverId}/channels/${channelId}/notification-override`);
    set((s) => {
      const channelOverrides = new Map(s.channelOverrides);
      channelOverrides.delete(channelId);
      return { channelOverrides };
    });
  },

  isServerMuted: (serverId) => {
    const pref = get().serverPreferences.get(serverId);
    if (!pref) return false;
    return isMutedActive(pref.muted, pref.mutedUntil);
  },

  isChannelMuted: (channelId) => {
    const override = get().channelOverrides.get(channelId);
    if (!override) return false;
    return isMutedActive(override.muted, override.mutedUntil);
  },

  getEffectiveLevel: (serverId, channelId) => {
    const override = get().channelOverrides.get(channelId);
    if (override && override.level !== 'default') {
      return override.level as NotificationLevel;
    }
    const pref = get().serverPreferences.get(serverId);
    return (pref?.level as NotificationLevel) ?? 'everything';
  },

  setDesktopNotificationsEnabled: (enabled) => {
    localStorage.setItem('desktopNotificationsEnabled', String(enabled));
    set({ desktopNotificationsEnabled: enabled });
  },

  reset: () => {
    set({
      serverPreferences: new Map(),
      channelOverrides: new Map(),
    });
  },
}));
