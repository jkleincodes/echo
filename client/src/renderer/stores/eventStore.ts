import { create } from 'zustand';
import { api } from '../lib/api';
import type { ScheduledEvent, RSVPStatus } from '../../../../shared/types';

interface EventState {
  events: ScheduledEvent[];
  loading: boolean;
  fetchEvents: (serverId: string) => Promise<void>;
  createEvent: (serverId: string, data: { title: string; description?: string | null; startAt: string; endAt?: string | null; location?: string | null; channelId?: string | null }) => Promise<void>;
  updateEvent: (serverId: string, eventId: string, data: Record<string, unknown>) => Promise<void>;
  deleteEvent: (serverId: string, eventId: string) => Promise<void>;
  setRsvp: (serverId: string, eventId: string, status: RSVPStatus) => Promise<void>;
  removeRsvp: (serverId: string, eventId: string) => Promise<void>;
  addEvent: (event: ScheduledEvent) => void;
  updateEventInStore: (event: ScheduledEvent) => void;
  removeEvent: (eventId: string) => void;
  reset: () => void;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  loading: false,

  fetchEvents: async (serverId: string) => {
    set({ loading: true });
    try {
      const res = await api.get(`/api/servers/${serverId}/events`);
      set({ events: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createEvent: async (serverId: string, data: { title: string; description?: string | null; startAt: string; endAt?: string | null; location?: string | null; channelId?: string | null }) => {
    const res = await api.post(`/api/servers/${serverId}/events`, data);
    const event = res.data.data;
    set((s) => ({ events: [...s.events, event] }));
  },

  updateEvent: async (serverId: string, eventId: string, data: Record<string, unknown>) => {
    const res = await api.patch(`/api/servers/${serverId}/events/${eventId}`, data);
    const updated = res.data.data;
    set((s) => ({
      events: s.events.map((e) => (e.id === eventId ? { ...e, ...updated } : e)),
    }));
  },

  deleteEvent: async (serverId: string, eventId: string) => {
    await api.delete(`/api/servers/${serverId}/events/${eventId}`);
    set((s) => ({ events: s.events.filter((e) => e.id !== eventId) }));
  },

  setRsvp: async (serverId: string, eventId: string, status: RSVPStatus) => {
    const res = await api.post(`/api/servers/${serverId}/events/${eventId}/rsvp`, { status });
    const updated = res.data.data;
    set((s) => ({
      events: s.events.map((e) => (e.id === eventId ? { ...e, ...updated } : e)),
    }));
  },

  removeRsvp: async (serverId: string, eventId: string) => {
    const res = await api.delete(`/api/servers/${serverId}/events/${eventId}/rsvp`);
    const updated = res.data.data;
    set((s) => ({
      events: s.events.map((e) => (e.id === eventId ? { ...e, ...updated } : e)),
    }));
  },

  addEvent: (event: ScheduledEvent) => {
    set((s) => {
      if (s.events.some((e) => e.id === event.id)) return s;
      return { events: [...s.events, event] };
    });
  },

  updateEventInStore: (event: ScheduledEvent) => {
    set((s) => ({
      events: s.events.map((e) => (e.id === event.id ? { ...e, ...event } : e)),
    }));
  },

  removeEvent: (eventId: string) => {
    set((s) => ({ events: s.events.filter((e) => e.id !== eventId) }));
  },

  reset: () => {
    set({ events: [], loading: false });
  },
}));
