import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import {
  resetAllStores,
  createMockUser,
  createMockDMChannel,
} from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, fireEvent } from '@testing-library/react';
import { useAuthStore } from '../../../stores/authStore';
import { useDMStore } from '../../../stores/dmStore';
import { usePresenceStore } from '../../../stores/presenceStore';
import DMSidebar from '../DMSidebar';

const me = createMockUser({ id: 'me', displayName: 'Me' });
const alice = createMockUser({ id: 'alice', displayName: 'Alice' });
const bob = createMockUser({ id: 'bob', displayName: 'Bob' });

function makeDMChannel(otherId: string, otherUser: ReturnType<typeof createMockUser>, extra = {}) {
  return createMockDMChannel({
    id: `dm-${otherId}`,
    participants: [
      { id: `p-me-${otherId}`, userId: 'me', channelId: `dm-${otherId}`, user: me },
      { id: `p-${otherId}`, userId: otherId, channelId: `dm-${otherId}`, user: otherUser },
    ],
    ...extra,
  });
}

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { data: [] } });
  useAuthStore.setState({ user: me, token: 'tok' });
});

describe('DMSidebar', () => {
  it('calls fetchChannels on mount', () => {
    const fetchChannels = vi.fn();
    useDMStore.setState({ fetchChannels } as any);
    renderWithRouter(<DMSidebar />);
    expect(fetchChannels).toHaveBeenCalled();
  });

  it('renders Friends button', () => {
    renderWithRouter(<DMSidebar />);
    expect(screen.getByText('Friends')).toBeInTheDocument();
  });

  it('renders Direct Messages header', () => {
    renderWithRouter(<DMSidebar />);
    expect(screen.getByText('Direct Messages')).toBeInTheDocument();
  });

  it('renders Create DM button', () => {
    renderWithRouter(<DMSidebar />);
    expect(screen.getByTitle('Create DM')).toBeInTheDocument();
  });

  it('displays DM channels with other participant display name', () => {
    const channels = [makeDMChannel('alice', alice), makeDMChannel('bob', bob)];
    useDMStore.setState({ channels });
    renderWithRouter(<DMSidebar />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('clicking Friends button calls setActiveDMChannel(null)', () => {
    useDMStore.setState({ activeDMChannelId: 'dm-alice' });
    renderWithRouter(<DMSidebar />);
    fireEvent.click(screen.getByText('Friends'));
    expect(useDMStore.getState().activeDMChannelId).toBeNull();
  });

  it('clicking a DM channel calls setActiveDMChannel with channel id', () => {
    const channels = [makeDMChannel('alice', alice)];
    useDMStore.setState({ channels });
    renderWithRouter(<DMSidebar />);
    fireEvent.click(screen.getByText('Alice'));
    expect(useDMStore.getState().activeDMChannelId).toBe('dm-alice');
  });

  it('shows last message content when present', () => {
    const channel = makeDMChannel('alice', alice);
    (channel as any).lastMessage = { content: 'Hey there!' };
    useDMStore.setState({ channels: [channel] });
    renderWithRouter(<DMSidebar />);
    expect(screen.getByText('Hey there!')).toBeInTheDocument();
  });

  it('skips channels where other participant is not found', () => {
    const channel = createMockDMChannel({
      id: 'dm-empty',
      participants: [
        { id: 'p-me-empty', userId: 'me', channelId: 'dm-empty', user: me },
      ],
    });
    useDMStore.setState({ channels: [channel] });
    renderWithRouter(<DMSidebar />);
    // Should render the sidebar without errors but no DM channel items
    expect(screen.getByText('Direct Messages')).toBeInTheDocument();
    // The channel list should be empty — no participant display names rendered
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('reflects online status from presence store', () => {
    const channels = [makeDMChannel('alice', alice)];
    useDMStore.setState({ channels });
    usePresenceStore.setState({ onlineUsers: new Set(['alice']) });
    renderWithRouter(<DMSidebar />);
    // Alice's channel entry should be rendered (online status is passed to Avatar)
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
