import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';
import type { SoundboardSound } from '../../../../shared/types';

interface SoundboardState {
  sounds: Record<string, SoundboardSound[]>; // serverId -> sounds
  soundboardVolume: number; // 0-1
  soundboardOpen: boolean;

  fetchSounds: (serverId: string) => Promise<void>;
  addSound: (sound: SoundboardSound) => void;
  removeSound: (serverId: string, soundId: string) => void;
  setSoundboardVolume: (volume: number) => void;
  setSoundboardOpen: (open: boolean) => void;
}

export const useSoundboardStore = create<SoundboardState>()(
  persist(
    (set, get) => ({
      sounds: {},
      soundboardVolume: 0.5,
      soundboardOpen: false,

      fetchSounds: async (serverId: string) => {
        try {
          const res = await api.get(`/api/servers/${serverId}/soundboard`);
          set((s) => ({
            sounds: { ...s.sounds, [serverId]: res.data.data },
          }));
        } catch (err) {
          console.error('Failed to fetch soundboard sounds:', err);
        }
      },

      addSound: (sound: SoundboardSound) =>
        set((s) => ({
          sounds: {
            ...s.sounds,
            [sound.serverId]: [...(s.sounds[sound.serverId] || []), sound],
          },
        })),

      removeSound: (serverId: string, soundId: string) =>
        set((s) => ({
          sounds: {
            ...s.sounds,
            [serverId]: (s.sounds[serverId] || []).filter((snd) => snd.id !== soundId),
          },
        })),

      setSoundboardVolume: (volume: number) =>
        set({ soundboardVolume: Math.max(0, Math.min(1, volume)) }),

      setSoundboardOpen: (open: boolean) => set({ soundboardOpen: open }),
    }),
    {
      name: 'soundboard-settings',
      partialize: (state) => ({ soundboardVolume: state.soundboardVolume }),
    },
  ),
);
