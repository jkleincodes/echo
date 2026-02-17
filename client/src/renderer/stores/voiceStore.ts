import { create } from 'zustand';

import type { UserVoiceState, UserMediaState, ProducerMediaType } from '../../../../shared/types';

interface VoiceState {
  connected: boolean;
  channelId: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: Map<string, boolean>; // userId -> speaking
  participants: string[];
  channelParticipants: Record<string, string[]>; // channelId -> userIds (all channels)
  userVoiceStates: Record<string, UserVoiceState>; // userId -> { muted, deafened }

  // Video/screen state
  cameraOn: boolean;
  screenSharing: boolean;
  screenSharePickerOpen: boolean;
  videoOverlayOpen: boolean;
  remoteVideoStreams: Map<string, Map<ProducerMediaType, MediaStream>>; // userId -> (mediaType -> stream)
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  userMediaStates: Record<string, UserMediaState>; // userId -> { cameraOn, screenSharing }
  screenAudioMuted: Map<string, boolean>; // userId -> muted

  setConnected: (connected: boolean, channelId: string | null) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;
  setParticipants: (participants: string[]) => void;
  addParticipant: (userId: string) => void;
  removeParticipant: (userId: string) => void;
  setChannelParticipants: (channelParticipants: Record<string, string[]>) => void;
  addChannelParticipant: (channelId: string, userId: string) => void;
  removeChannelParticipant: (channelId: string, userId: string) => void;
  setUserVoiceState: (userId: string, state: UserVoiceState) => void;
  setAllVoiceStates: (states: Record<string, UserVoiceState>) => void;
  removeUserVoiceState: (userId: string) => void;

  // Video/screen actions
  setCameraOn: (on: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setScreenSharePickerOpen: (open: boolean) => void;
  setVideoOverlayOpen: (open: boolean) => void;
  setRemoteVideoStream: (userId: string, mediaType: ProducerMediaType, stream: MediaStream) => void;
  removeRemoteVideoStream: (userId: string, mediaType: ProducerMediaType) => void;
  setLocalVideoStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setUserMediaState: (userId: string, state: UserMediaState) => void;
  removeUserMediaState: (userId: string) => void;
  setAllMediaStates: (states: Record<string, UserMediaState>) => void;
  setScreenAudioMuted: (userId: string, muted: boolean) => void;

  resetLocal: () => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  connected: false,
  channelId: null,
  muted: false,
  deafened: false,
  speaking: new Map(),
  participants: [],
  channelParticipants: {},
  userVoiceStates: {},

  // Video/screen state
  cameraOn: false,
  screenSharing: false,
  screenSharePickerOpen: false,
  videoOverlayOpen: false,
  remoteVideoStreams: new Map(),
  localVideoStream: null,
  localScreenStream: null,
  userMediaStates: {},
  screenAudioMuted: new Map(),

  setConnected: (connected, channelId) => set({ connected, channelId }),
  setMuted: (muted) => set({ muted }),
  setDeafened: (deafened) => set({ deafened }),

  setSpeaking: (userId, speaking) =>
    set((s) => {
      const map = new Map(s.speaking);
      map.set(userId, speaking);
      return { speaking: map };
    }),

  setParticipants: (participants) => set({ participants }),
  addParticipant: (userId) =>
    set((s) => ({
      participants: s.participants.includes(userId) ? s.participants : [...s.participants, userId],
    })),
  removeParticipant: (userId) =>
    set((s) => ({ participants: s.participants.filter((id) => id !== userId) })),

  setChannelParticipants: (channelParticipants) => set({ channelParticipants }),

  addChannelParticipant: (channelId, userId) =>
    set((s) => {
      const current = s.channelParticipants[channelId] || [];
      if (current.includes(userId)) return s;
      return { channelParticipants: { ...s.channelParticipants, [channelId]: [...current, userId] } };
    }),

  removeChannelParticipant: (channelId, userId) =>
    set((s) => {
      const current = s.channelParticipants[channelId] || [];
      const updated = current.filter((id) => id !== userId);
      const cp = { ...s.channelParticipants };
      if (updated.length === 0) {
        delete cp[channelId];
      } else {
        cp[channelId] = updated;
      }
      return { channelParticipants: cp };
    }),

  setUserVoiceState: (userId, state) =>
    set((s) => ({ userVoiceStates: { ...s.userVoiceStates, [userId]: state } })),

  setAllVoiceStates: (states) => set({ userVoiceStates: states }),

  removeUserVoiceState: (userId) =>
    set((s) => {
      const { [userId]: _, ...rest } = s.userVoiceStates;
      return { userVoiceStates: rest };
    }),

  // Video/screen actions
  setCameraOn: (on) => set({ cameraOn: on }),
  setScreenSharing: (sharing) => set({ screenSharing: sharing }),
  setScreenSharePickerOpen: (open) => set({ screenSharePickerOpen: open }),
  setVideoOverlayOpen: (open) => set({ videoOverlayOpen: open }),

  setRemoteVideoStream: (userId, mediaType, stream) =>
    set((s) => {
      const map = new Map(s.remoteVideoStreams);
      const userStreams = new Map(map.get(userId) || new Map());
      userStreams.set(mediaType, stream);
      map.set(userId, userStreams);
      return { remoteVideoStreams: map };
    }),

  removeRemoteVideoStream: (userId, mediaType) =>
    set((s) => {
      const map = new Map(s.remoteVideoStreams);
      const userStreams = map.get(userId);
      if (userStreams) {
        const updated = new Map(userStreams);
        updated.delete(mediaType);
        if (updated.size === 0) {
          map.delete(userId);
        } else {
          map.set(userId, updated);
        }
      }
      return { remoteVideoStreams: map };
    }),

  setLocalVideoStream: (stream) => set({ localVideoStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),

  setUserMediaState: (userId, state) =>
    set((s) => ({ userMediaStates: { ...s.userMediaStates, [userId]: state } })),

  removeUserMediaState: (userId) =>
    set((s) => {
      const { [userId]: _, ...rest } = s.userMediaStates;
      return { userMediaStates: rest };
    }),

  setAllMediaStates: (states) => set({ userMediaStates: states }),

  setScreenAudioMuted: (userId, muted) =>
    set((s) => {
      const map = new Map(s.screenAudioMuted);
      map.set(userId, muted);
      return { screenAudioMuted: map };
    }),

  resetLocal: () =>
    set({
      connected: false,
      channelId: null,
      muted: false,
      deafened: false,
      speaking: new Map(),
      participants: [],
      cameraOn: false,
      screenSharing: false,
      screenSharePickerOpen: false,
      videoOverlayOpen: false,
      remoteVideoStreams: new Map(),
      localVideoStream: null,
      localScreenStream: null,
      screenAudioMuted: new Map(),
    }),

  reset: () =>
    set({
      connected: false,
      channelId: null,
      muted: false,
      deafened: false,
      speaking: new Map(),
      participants: [],
      channelParticipants: {},
      userVoiceStates: {},
      cameraOn: false,
      screenSharing: false,
      screenSharePickerOpen: false,
      videoOverlayOpen: false,
      remoteVideoStreams: new Map(),
      localVideoStream: null,
      localScreenStream: null,
      userMediaStates: {},
      screenAudioMuted: new Map(),
    }),
}));
