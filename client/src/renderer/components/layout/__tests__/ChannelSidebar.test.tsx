import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockServer, createMockChannel, createMockMember, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import { useAuthStore } from '../../../stores/authStore';
import ChannelSidebar from '../ChannelSidebar';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  const owner = createMockUser({ id: 'owner-1' });
  const server = createMockServer({ id: 's1', name: 'Test Server', ownerId: 'owner-1' });
  const member = createMockMember({ userId: 'owner-1', role: 'owner', user: owner });
  useAuthStore.setState({ user: owner, token: 'tok' });
  useServerStore.setState({
    servers: [server],
    activeServerId: 's1',
    channels: [
      createMockChannel({ id: 'c1', name: 'general', type: 'text', serverId: 's1' }),
      createMockChannel({ id: 'c2', name: 'voice-chat', type: 'voice', serverId: 's1' }),
    ],
    members: [member],
  });
});

describe('ChannelSidebar', () => {
  it('renders server name', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByText('Test Server')).toBeInTheDocument();
  });

  it('renders text channels', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('renders voice channels', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByText('voice-chat')).toBeInTheDocument();
  });

  it('sets active channel on text channel click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChannelSidebar />);
    await user.click(screen.getByText('general'));
    expect(useServerStore.getState().activeChannelId).toBe('c1');
  });

  it('shows invite button', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByTitle('Invite People')).toBeInTheDocument();
  });

  it('shows settings button for admin', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByTitle('Server Settings')).toBeInTheDocument();
  });

  it('shows create channel button for admin', () => {
    renderWithRouter(<ChannelSidebar />);
    expect(screen.getByText('Create Category')).toBeInTheDocument();
  });

  it('opens invite modal', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValueOnce({ data: { data: { code: 'abc123' } } });
    renderWithRouter(<ChannelSidebar />);
    await user.click(screen.getByTitle('Invite People'));
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });
});
