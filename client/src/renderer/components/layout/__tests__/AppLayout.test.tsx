import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockServer, createMockChannel } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, waitFor } from '@testing-library/react';
import { useServerStore } from '../../../stores/serverStore';
import AppLayout from '../AppLayout';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { data: [] } });
});

describe('AppLayout', () => {
  it('shows welcome message when no server selected and not home', () => {
    renderWithRouter(<AppLayout />);
    expect(screen.getByText('Welcome to Echo')).toBeInTheDocument();
  });

  it('shows DM sidebar when showHome is true', () => {
    useServerStore.setState({ showHome: true });
    renderWithRouter(<AppLayout />);
    expect(screen.getByText('Friends')).toBeInTheDocument();
  });

  it('shows channel sidebar when a server is active', async () => {
    const server = createMockServer({ id: 's1', name: 'Test Server' });
    const channel = createMockChannel({ id: 'c1', serverId: 's1', name: 'general' });
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/api/servers') return Promise.resolve({ data: { data: [server] } });
      if (url.includes('/api/servers/s1')) return Promise.resolve({ data: { data: { channels: [channel], categories: [], members: [], roles: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    useServerStore.setState({ servers: [server], activeServerId: 's1', channels: [channel] });
    renderWithRouter(<AppLayout />);
    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument();
    });
  });

  it('renders server sidebar always', () => {
    renderWithRouter(<AppLayout />);
    // ServerSidebar renders the DM button with title "Direct Messages"
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument();
  });
});
