import { useAudioSettingsStore } from '../stores/audioSettingsStore';
import { useVoiceStore } from '../stores/voiceStore';

import voiceJoinSrc from '../assets/sounds/voice-join.mp3';
import voiceLeaveSrc from '../assets/sounds/voice-leave.mp3';
import userJoinSrc from '../assets/sounds/user-join.mp3';
import userLeaveSrc from '../assets/sounds/user-leave.mp3';
import muteSrc from '../assets/sounds/mute.mp3';
import unmuteSrc from '../assets/sounds/unmute.mp3';
import deafenSrc from '../assets/sounds/deafen.mp3';
import undeafenSrc from '../assets/sounds/undeafen.mp3';
import streamStartSrc from '../assets/sounds/stream-start.mp3';
import notificationSrc from '../assets/sounds/notification.mp3';

const soundAssets = {
  voiceJoin: voiceJoinSrc,
  voiceLeave: voiceLeaveSrc,
  userJoin: userJoinSrc,
  userLeave: userLeaveSrc,
  mute: muteSrc,
  unmute: unmuteSrc,
  deafen: deafenSrc,
  undeafen: undeafenSrc,
  streamStart: streamStartSrc,
  notification: notificationSrc,
} as const;

export type SoundEffect = keyof typeof soundAssets;

// Effects that should still play even when deafened
const PLAY_WHEN_DEAFENED: SoundEffect[] = ['deafen', 'undeafen', 'voiceLeave'];

export function playSoundEffect(effect: SoundEffect) {
  console.log('[SoundEffects] playSoundEffect called:', effect);
  // Skip if deafened (unless it's an exempt effect)
  const deafened = useVoiceStore.getState().deafened;
  if (deafened && !PLAY_WHEN_DEAFENED.includes(effect)) {
    return;
  }

  const src = soundAssets[effect];
  if (!src) return;

  const audio = new Audio(src);

  // Apply volume: output volume setting
  const outputVolume = useAudioSettingsStore.getState().outputVolume;
  audio.volume = Math.min(1, outputVolume);

  // Route to the configured output device
  const outputDeviceId = useAudioSettingsStore.getState().outputDeviceId;
  if (outputDeviceId && typeof (audio as any).setSinkId === 'function') {
    (audio as any).setSinkId(outputDeviceId).catch(() => {});
  }

  audio.play().catch((err) => {
    console.error('[SoundEffects] Failed to play', effect, src, err);
  });
}
