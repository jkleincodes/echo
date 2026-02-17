import { useCallback, useMemo } from 'react';
import { voiceService, type ScreenShareQuality } from '../services/voiceService';
import { useVoiceStore } from '../stores/voiceStore';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { socketService } from '../services/socketService';
import type { ProducerMediaType } from '../../../../shared/types';

export function useVoice() {
  const { connected, channelId, muted, deafened, cameraOn, screenSharing, screenSharePickerOpen, videoOverlayOpen, screenAudioMuted, setConnected, setMuted, setDeafened, setSpeaking, addParticipant, removeParticipant, addChannelParticipant, removeChannelParticipant, setUserVoiceState, setCameraOn, setScreenSharing, setScreenSharePickerOpen, setVideoOverlayOpen, setRemoteVideoStream, removeRemoteVideoStream, setLocalVideoStream, setLocalScreenStream, setUserMediaState, setScreenAudioMuted, resetLocal } = useVoiceStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const servers = useServerStore((s) => s.servers);

  // Check if the user is currently in an AFK channel
  const isInAfkChannel = useMemo(() => {
    if (!channelId) return false;
    return servers.some((s) => s.afkChannelId === channelId);
  }, [channelId, servers]);

  const joinVoice = useCallback(async (targetChannelId: string) => {
    console.log('[VOICE][useVoice] joinVoice() called, targetChannelId:', targetChannelId, 'currentUserId:', currentUserId);
    // Preserve mute/deafen state when switching channels
    const prevState = useVoiceStore.getState();
    const prevMuted = prevState.muted;
    const prevDeafened = prevState.deafened;
    const isSwitching = prevState.connected && prevState.channelId !== null;
    console.log('[VOICE][useVoice] Previous state - connected:', prevState.connected, 'channelId:', prevState.channelId, 'isSwitching:', isSwitching);

    // If switching channels, remove self from old channel
    const oldChannelId = prevState.channelId;
    if (oldChannelId && currentUserId) {
      removeChannelParticipant(oldChannelId, currentUserId);
    }

    voiceService.setCallbacks({
      onSpeakingChange: (userId, isSpeaking) => {
        // Map 'local' to current user id
        const resolvedId = userId === 'local' ? (currentUserId || userId) : userId;
        setSpeaking(resolvedId, isSpeaking);
      },
      onRemoteStream: (userId, stream, mediaType) => {
        console.log('[VOICE][useVoice] onRemoteStream callback, userId:', userId, 'mediaType:', mediaType);
        voiceService.playRemoteStream(userId, stream, mediaType);
        addParticipant(userId);
      },
      onRemoteStreamRemoved: (userId, mediaType) => {
        console.log('[VOICE][useVoice] onRemoteStreamRemoved callback, userId:', userId, 'mediaType:', mediaType);
        voiceService.removeRemoteStream(userId, mediaType);
        if (mediaType === 'audio') {
          removeParticipant(userId);
        }
      },
      onRemoteVideoStream: (userId: string, stream: MediaStream, mediaType: ProducerMediaType) => {
        console.log('[VOICE][useVoice] onRemoteVideoStream callback, userId:', userId, 'mediaType:', mediaType);
        setRemoteVideoStream(userId, mediaType, stream);
        // Auto-open video overlay when any video/screen starts
        useVoiceStore.getState().setVideoOverlayOpen(true);
      },
      onRemoteVideoStreamRemoved: (userId: string, mediaType: ProducerMediaType) => {
        console.log('[VOICE][useVoice] onRemoteVideoStreamRemoved callback, userId:', userId, 'mediaType:', mediaType);
        removeRemoteVideoStream(userId, mediaType);
      },
      onScreenShareStopped: () => {
        console.log('[VOICE][useVoice] onScreenShareStopped callback');
        // Screen share was stopped via OS/browser UI
        setScreenSharing(false);
        setLocalScreenStream(null);
        // Broadcast media state update
        const socket = socketService.getSocket();
        const store = useVoiceStore.getState();
        socket?.emit('voice:media-state-update', { cameraOn: store.cameraOn, screenSharing: false });
        if (currentUserId) {
          setUserMediaState(currentUserId, { cameraOn: store.cameraOn, screenSharing: false });
        }
      },
    });

    try {
      await voiceService.join(targetChannelId);
      console.log('[VOICE][useVoice] voiceService.join() completed successfully');
    } catch (err) {
      console.error('[VOICE][useVoice] voiceService.join() FAILED:', err);
      throw err;
    }
    setConnected(true, targetChannelId);

    // Restore mute/deafen state when switching channels
    const restoredMuted = isSwitching ? prevMuted : false;
    const restoredDeafened = isSwitching ? prevDeafened : false;
    if (restoredMuted || restoredDeafened) {
      voiceService.setMuteDeafenState(restoredMuted, restoredDeafened);
    }
    setMuted(restoredMuted);
    setDeafened(restoredDeafened);

    // Add self to channel participants (broadcast doesn't send back to sender)
    if (currentUserId) {
      addChannelParticipant(targetChannelId, currentUserId);

      // Set own voice state in store and broadcast to others
      setUserVoiceState(currentUserId, { muted: restoredMuted, deafened: restoredDeafened });
      const socket = socketService.getSocket();
      socket?.emit('voice:voice-state-update', { muted: restoredMuted, deafened: restoredDeafened });
    }
  }, [setConnected, setSpeaking, addParticipant, removeParticipant, addChannelParticipant, removeChannelParticipant, currentUserId, setRemoteVideoStream, removeRemoteVideoStream, setScreenSharing, setLocalScreenStream, setUserMediaState]);

  const leaveVoice = useCallback(async () => {
    console.log('[VOICE][useVoice] leaveVoice() called');
    const currentChannelId = useVoiceStore.getState().channelId;
    await voiceService.leave();
    // Remove self from channel participants
    if (currentChannelId && currentUserId) {
      removeChannelParticipant(currentChannelId, currentUserId);
    }
    // Broadcast media state cleared
    const socket = socketService.getSocket();
    socket?.emit('voice:media-state-update', { cameraOn: false, screenSharing: false });
    if (currentUserId) {
      setUserMediaState(currentUserId, { cameraOn: false, screenSharing: false });
    }
    // Reset only local voice state, preserve global channelParticipants/userVoiceStates/userMediaStates
    // so the sidebar continues to show other users in voice channels
    resetLocal();
  }, [resetLocal, removeChannelParticipant, currentUserId, setUserMediaState]);

  const toggleMute = useCallback(() => {
    const { muted: newMuted, deafened: newDeafened } = voiceService.toggleMute();
    setMuted(newMuted);
    setDeafened(newDeafened);
    // Broadcast voice state to others
    const socket = socketService.getSocket();
    socket?.emit('voice:voice-state-update', { muted: newMuted, deafened: newDeafened });
    // Update own voice state in store
    if (currentUserId) {
      setUserVoiceState(currentUserId, { muted: newMuted, deafened: newDeafened });
    }
  }, [setMuted, setDeafened, setUserVoiceState, currentUserId]);

  const toggleDeafen = useCallback(() => {
    const { muted: newMuted, deafened: newDeafened } = voiceService.toggleDeafen();
    setMuted(newMuted);
    setDeafened(newDeafened);
    // Broadcast voice state to others
    const socket = socketService.getSocket();
    socket?.emit('voice:voice-state-update', { muted: newMuted, deafened: newDeafened });
    // Update own voice state in store
    if (currentUserId) {
      setUserVoiceState(currentUserId, { muted: newMuted, deafened: newDeafened });
    }
  }, [setMuted, setDeafened, setUserVoiceState, currentUserId]);

  const toggleCamera = useCallback(async () => {
    const store = useVoiceStore.getState();
    try {
      if (store.cameraOn) {
        voiceService.stopVideo();
        setCameraOn(false);
        setLocalVideoStream(null);
      } else {
        await voiceService.produceVideo();
        setCameraOn(true);
        setLocalVideoStream(voiceService.getLocalVideoStream());
        setVideoOverlayOpen(true);
      }
      // Broadcast media state update
      const newCameraOn = !store.cameraOn;
      const socket = socketService.getSocket();
      socket?.emit('voice:media-state-update', { cameraOn: newCameraOn, screenSharing: store.screenSharing });
      if (currentUserId) {
        setUserMediaState(currentUserId, { cameraOn: newCameraOn, screenSharing: store.screenSharing });
      }
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  }, [setCameraOn, setLocalVideoStream, setVideoOverlayOpen, setUserMediaState, currentUserId]);

  const toggleScreenShare = useCallback(() => {
    const store = useVoiceStore.getState();
    if (store.screenSharing) {
      voiceService.stopScreenShare();
      setScreenSharing(false);
      setLocalScreenStream(null);
      // Broadcast media state update
      const socket = socketService.getSocket();
      socket?.emit('voice:media-state-update', { cameraOn: store.cameraOn, screenSharing: false });
      if (currentUserId) {
        setUserMediaState(currentUserId, { cameraOn: store.cameraOn, screenSharing: false });
      }
    } else {
      setScreenSharePickerOpen(true);
    }
  }, [setScreenSharing, setLocalScreenStream, setScreenSharePickerOpen, setUserMediaState, currentUserId]);

  const startScreenShare = useCallback(async (quality: ScreenShareQuality, audio = true) => {
    const store = useVoiceStore.getState();
    try {
      await voiceService.produceScreenShare(quality, audio);
      setScreenSharing(true);
      setLocalScreenStream(voiceService.getLocalScreenStream());
      setVideoOverlayOpen(true);
      setScreenSharePickerOpen(false);
      // Broadcast media state update
      const socket = socketService.getSocket();
      socket?.emit('voice:media-state-update', { cameraOn: store.cameraOn, screenSharing: true });
      if (currentUserId) {
        setUserMediaState(currentUserId, { cameraOn: store.cameraOn, screenSharing: true });
      }
    } catch (err) {
      console.error('Failed to start screen share:', err);
      setScreenSharePickerOpen(false);
    }
  }, [setScreenSharing, setLocalScreenStream, setVideoOverlayOpen, setScreenSharePickerOpen, setUserMediaState, currentUserId]);

  const toggleScreenAudioMute = useCallback((userId: string) => {
    const current = useVoiceStore.getState().screenAudioMuted.get(userId) ?? false;
    const muted = !current;
    voiceService.setScreenAudioMuted(userId, muted);
    setScreenAudioMuted(userId, muted);
  }, [setScreenAudioMuted]);

  return {
    connected,
    channelId,
    muted,
    deafened,
    cameraOn,
    screenSharing,
    screenSharePickerOpen,
    screenAudioMuted,
    videoOverlayOpen,
    isInAfkChannel,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    startScreenShare,
    toggleScreenAudioMute,
    setScreenSharePickerOpen,
    setVideoOverlayOpen,
  };
}
