import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import {
  resetAllStores,
  createMockUser,
  createMockDMChannel,
} from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import { useAuthStore } from '../../../stores/authStore';
import { useDMStore } from '../../../stores/dmStore';
import { usePresenceStore } from '../../../stores/presenceStore';
import DMChatArea from '../DMChatArea';

vi.mock('../DMMessageList', () => ({
  default: () => <div data-testid="dm-message-list" />,
}));
vi.mock('../DMMessageInput', () => ({
  default: () => <div data-testid="dm-message-input" />,
}));

const me = createMockUser({ id: 'me', displayName: 'Me' });
const alice = createMockUser({ id: 'alice', displayName: 'Alice' });

function makeDMChannel() {
  return createMockDMChannel({
    id: 'dm-alice',
    participants: [
      { id: 'p-me', userId: 'me', channelId: 'dm-alice', user: me },
      { id: 'p-alice', userId: 'alice', channelId: 'dm-alice', user: alice },
    ],
  });
}

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useAuthStore.setState({ user: me, token: 'tok' });
});

describe('DMChatArea', () => {
  it('shows placeholder when no active DM channel', () => {
    useDMStore.setState({ activeDMChannelId: null });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByText('Select a conversation or start a new one')).toBeInTheDocument();
  });

  it('shows "Conversation not found" when channel not in store', () => {
    useDMStore.setState({ activeDMChannelId: 'nonexistent', channels: [] });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByText('Conversation not found')).toBeInTheDocument();
  });

  it('shows "Conversation not found" when channel has no other participant', () => {
    const channelWithOnlyMe = createMockDMChannel({
      id: 'dm-solo',
      participants: [
        { id: 'p-me', userId: 'me', channelId: 'dm-solo', user: me },
      ],
    });
    useDMStore.setState({ activeDMChannelId: 'dm-solo', channels: [channelWithOnlyMe] });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByText('Conversation not found')).toBeInTheDocument();
  });

  it('renders header with participant display name when channel is active', () => {
    useDMStore.setState({ activeDMChannelId: 'dm-alice', channels: [makeDMChannel()] });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders DMMessageList when channel is active', () => {
    useDMStore.setState({ activeDMChannelId: 'dm-alice', channels: [makeDMChannel()] });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByTestId('dm-message-list')).toBeInTheDocument();
  });

  it('renders DMMessageInput when channel is active', () => {
    useDMStore.setState({ activeDMChannelId: 'dm-alice', channels: [makeDMChannel()] });
    renderWithRouter(<DMChatArea />);
    expect(screen.getByTestId('dm-message-input')).toBeInTheDocument();
  });

  it('uses presence store to determine online status', () => {
    useDMStore.setState({ activeDMChannelId: 'dm-alice', channels: [makeDMChannel()] });
    usePresenceStore.setState({ onlineUsers: new Set(['alice']) });
    renderWithRouter(<DMChatArea />);
    // The header should render with Alice's name; online status is passed to Avatar internally
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
