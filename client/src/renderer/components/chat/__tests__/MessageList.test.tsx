import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockMessage, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, waitFor } from '@testing-library/react';
import { useServerStore } from '../../../stores/serverStore';
import { useAuthStore } from '../../../stores/authStore';
import { useMessageStore } from '../../../stores/messageStore';
import MessageList from '../MessageList';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { data: [], nextCursor: null } });
  useServerStore.setState({ activeServerId: 's1' });
  useAuthStore.setState({ user: createMockUser({ id: 'u1' }), token: 'tok' });
});

describe('MessageList', () => {
  it('fetches messages on mount', async () => {
    renderWithRouter(<MessageList channelId="c1" />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/api/servers/s1/channels/c1/messages');
    });
  });

  it('joins socket channel on mount', () => {
    renderWithRouter(<MessageList channelId="c1" />);
    expect(mockSocket.emit).toHaveBeenCalledWith('channel:join', 'c1');
  });

  it('renders messages from store', () => {
    const author = createMockUser({ id: 'u1', displayName: 'Alice' });
    const msg = createMockMessage({ id: 'm1', content: 'Hello world', channelId: 'c1', author, authorId: 'u1' });
    const messages = new Map([['c1', [msg]]]);
    useMessageStore.setState({ messages });
    renderWithRouter(<MessageList channelId="c1" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    const loading = new Map([['c1', true]]);
    useMessageStore.setState({ loading });
    const { container } = renderWithRouter(<MessageList channelId="c1" />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('groups messages by same author within 5 min', () => {
    const author = createMockUser({ id: 'u1', displayName: 'Alice' });
    const now = new Date();
    const msg1 = createMockMessage({ id: 'm1', content: 'First', channelId: 'c1', author, authorId: 'u1', createdAt: now.toISOString() });
    const msg2 = createMockMessage({ id: 'm2', content: 'Second', channelId: 'c1', author, authorId: 'u1', createdAt: new Date(now.getTime() + 60000).toISOString() });
    const messages = new Map([['c1', [msg1, msg2]]]);
    useMessageStore.setState({ messages });
    renderWithRouter(<MessageList channelId="c1" />);
    // Both messages should be visible
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    // Only one author name (header) since they're grouped
    expect(screen.getAllByText('Alice')).toHaveLength(1);
  });
});
