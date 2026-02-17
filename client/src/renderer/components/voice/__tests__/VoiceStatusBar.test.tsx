import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/voiceService.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockChannel } from '../../../__tests__/mocks/stores.mock';

const mockUseVoice = {
  connected: false,
  channelId: null as string | null,
  muted: false,
  deafened: false,
  cameraOn: false,
  screenSharing: false,
  screenSharePickerOpen: false,
  screenAudioMuted: new Map(),
  videoOverlayOpen: false,
  leaveVoice: vi.fn(),
  toggleMute: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleCamera: vi.fn(),
  toggleScreenShare: vi.fn(),
  startScreenShare: vi.fn(),
  toggleScreenAudioMute: vi.fn(),
  setScreenSharePickerOpen: vi.fn(),
  setVideoOverlayOpen: vi.fn(),
  speaking: new Map(),
  participants: [],
  joinVoice: vi.fn(),
};

vi.mock('../../../hooks/useVoice', () => ({
  useVoice: () => mockUseVoice,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { useServerStore } from '../../../stores/serverStore';
import VoiceStatusBar from '../VoiceStatusBar';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  mockUseVoice.connected = false;
  mockUseVoice.channelId = null;
  mockUseVoice.muted = false;
  mockUseVoice.deafened = false;
});

describe('VoiceStatusBar', () => {
  it('returns null when not connected', () => {
    const { container } = render(<VoiceStatusBar />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when connected but no channelId', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = null;
    const { container } = render(<VoiceStatusBar />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Voice Connected" when connected with channelId', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    render(<VoiceStatusBar />);
    expect(screen.getByText('Voice Connected')).toBeInTheDocument();
  });

  it('shows channel name from store', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    const channel = createMockChannel({ id: 'ch-1', name: 'General Voice' });
    useServerStore.setState({ channels: [channel] });
    render(<VoiceStatusBar />);
    expect(screen.getByText('General Voice')).toBeInTheDocument();
  });

  it('mute button calls toggleMute and title is "Mute" when unmuted', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    mockUseVoice.muted = false;
    render(<VoiceStatusBar />);
    const btn = screen.getByTitle('Mute');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mockUseVoice.toggleMute).toHaveBeenCalledTimes(1);
  });

  it('mute button title is "Unmute" when muted', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    mockUseVoice.muted = true;
    render(<VoiceStatusBar />);
    expect(screen.getByTitle('Unmute')).toBeInTheDocument();
  });

  it('deafen button calls toggleDeafen and title is "Deafen" when not deafened', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    mockUseVoice.deafened = false;
    render(<VoiceStatusBar />);
    const btn = screen.getByTitle('Deafen');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mockUseVoice.toggleDeafen).toHaveBeenCalledTimes(1);
  });

  it('deafen button title is "Undeafen" when deafened', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    mockUseVoice.deafened = true;
    render(<VoiceStatusBar />);
    expect(screen.getByTitle('Undeafen')).toBeInTheDocument();
  });

  it('does not render disconnect button (moved to UserPanel)', () => {
    mockUseVoice.connected = true;
    mockUseVoice.channelId = 'ch-1';
    render(<VoiceStatusBar />);
    expect(screen.queryByTitle('Disconnect')).not.toBeInTheDocument();
  });
});
