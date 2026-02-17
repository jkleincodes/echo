import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AudioSettingsState {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  videoDeviceId: string | null;
  inputGain: number; // 0–3, default 1.0
  outputVolume: number; // 0–2, default 1.0
  noiseSuppression: boolean; // AI noise suppression (RNNoise), default true

  setInputDevice: (deviceId: string | null) => void;
  setOutputDevice: (deviceId: string | null) => void;
  setVideoDevice: (deviceId: string | null) => void;
  setInputGain: (gain: number) => void;
  setOutputVolume: (volume: number) => void;
  setNoiseSuppression: (enabled: boolean) => void;
}

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set) => ({
      inputDeviceId: null,
      outputDeviceId: null,
      videoDeviceId: null,
      inputGain: 1.0,
      outputVolume: 1.0,
      noiseSuppression: true,

      setInputDevice: (deviceId) => set({ inputDeviceId: deviceId }),
      setOutputDevice: (deviceId) => set({ outputDeviceId: deviceId }),
      setVideoDevice: (deviceId) => set({ videoDeviceId: deviceId }),
      setInputGain: (gain) => set({ inputGain: Math.max(0, Math.min(3, gain)) }),
      setOutputVolume: (volume) => set({ outputVolume: Math.max(0, Math.min(2, volume)) }),
      setNoiseSuppression: (enabled) => set({ noiseSuppression: enabled }),
    }),
    {
      name: 'audio-settings',
    },
  ),
);
