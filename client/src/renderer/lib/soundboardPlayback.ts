import { getServerUrl } from './serverUrl';
import { useAudioSettingsStore } from '../stores/audioSettingsStore';
import { useSoundboardStore } from '../stores/soundboardStore';

// Track active sounds to prevent overlapping the same sound
const activeSounds = new Map<string, HTMLAudioElement>();

export function playbackSoundboardSound(data: {
  soundId: string;
  soundUrl: string;
  userId: string;
  volume: number;
}) {
  // Stop any previous instance of the same sound
  const existing = activeSounds.get(data.soundId);
  if (existing) {
    existing.pause();
    existing.src = '';
    activeSounds.delete(data.soundId);
  }

  const audio = new Audio(`${getServerUrl()}${data.soundUrl}`);

  // Apply volume: sender volume * soundboard volume * output volume
  const soundboardVolume = useSoundboardStore.getState().soundboardVolume;
  const outputVolume = useAudioSettingsStore.getState().outputVolume;
  audio.volume = Math.min(1, data.volume * soundboardVolume * outputVolume);

  // Route to the configured output device
  const outputDeviceId = useAudioSettingsStore.getState().outputDeviceId;
  if (outputDeviceId && typeof (audio as any).setSinkId === 'function') {
    (audio as any).setSinkId(outputDeviceId).catch(() => {});
  }

  activeSounds.set(data.soundId, audio);

  audio.addEventListener('ended', () => {
    activeSounds.delete(data.soundId);
  });

  audio.addEventListener('error', () => {
    activeSounds.delete(data.soundId);
  });

  audio.play().catch(() => {
    activeSounds.delete(data.soundId);
  });
}
