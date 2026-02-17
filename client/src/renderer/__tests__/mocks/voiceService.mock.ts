import { vi } from 'vitest';

export const mockVoiceService = {
  join: vi.fn().mockResolvedValue(undefined),
  leave: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn().mockReturnValue(true),
  toggleDeafen: vi.fn().mockReturnValue(true),
  setCallbacks: vi.fn(),
  isConnected: vi.fn().mockReturnValue(false),
};

vi.mock('@/services/voiceService', () => ({
  voiceService: mockVoiceService,
}));
