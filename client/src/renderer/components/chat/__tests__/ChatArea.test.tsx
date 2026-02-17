import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockChannel, createMockServer, createMockUser, createMockMember } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import { useAuthStore } from '../../../stores/authStore';
import ChatArea from '../ChatArea';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { data: [], nextCursor: null } });
});

describe('ChatArea', () => {
  it('shows placeholder when no text channel selected', () => {
    useServerStore.setState({ channels: [], activeChannelId: null });
    renderWithRouter(<ChatArea />);
    expect(screen.getByText(/select a text channel/i)).toBeInTheDocument();
  });

  it('renders channel header with name', () => {
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text' });
    const user = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user, token: 'tok' });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel], members: [] });
    renderWithRouter(<ChatArea />);
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('shows pinned messages button', () => {
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text' });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel] });
    renderWithRouter(<ChatArea />);
    expect(screen.getByTitle('Pinned Messages')).toBeInTheDocument();
  });

  it('shows search button', () => {
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text' });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel] });
    renderWithRouter(<ChatArea />);
    expect(screen.getByTitle('Search')).toBeInTheDocument();
  });

  it('shows topic when channel has one', () => {
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text', topic: 'Welcome!' });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel] });
    renderWithRouter(<ChatArea />);
    expect(screen.getByText('Welcome!')).toBeInTheDocument();
  });

  it('shows Set a topic button when no topic', () => {
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text', topic: null });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel] });
    renderWithRouter(<ChatArea />);
    expect(screen.getByText('Set a topic')).toBeInTheDocument();
  });

  it('toggles pinned messages panel', async () => {
    const user = userEvent.setup();
    const channel = createMockChannel({ id: 'c1', name: 'general', type: 'text' });
    useServerStore.setState({ activeServerId: 's1', activeChannelId: 'c1', channels: [channel] });
    mockApi.get.mockResolvedValue({ data: { data: [] } });
    renderWithRouter(<ChatArea />);
    await user.click(screen.getByTitle('Pinned Messages'));
    expect(screen.getByText('Pinned Messages')).toBeInTheDocument();
  });
});
