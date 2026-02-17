import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockMessage, createMockUser, createMockMember } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import { useServerStore } from '../../../stores/serverStore';
import PinnedMessagesPanel from '../PinnedMessagesPanel';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  const user = createMockUser({ id: 'u1' });
  useAuthStore.setState({ user, token: 'tok' });
  useServerStore.setState({ members: [createMockMember({ userId: 'u1', role: 'admin', user })] });
});

describe('PinnedMessagesPanel', () => {
  it('fetches pinned messages on mount', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/api/servers/s1/channels/c1/pins');
    });
  });

  it('shows empty state when no pins', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/doesn't have any pinned messages/i)).toBeInTheDocument();
    });
  });

  it('renders pinned messages', async () => {
    const msg = createMockMessage({ id: 'm1', content: 'Important info', author: createMockUser({ displayName: 'Alice' }) });
    mockApi.get.mockResolvedValueOnce({ data: { data: [msg] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Important info')).toBeInTheDocument();
    });
  });

  it('shows jump button', async () => {
    const msg = createMockMessage({ id: 'm1', content: 'Test' });
    mockApi.get.mockResolvedValueOnce({ data: { data: [msg] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Jump')).toBeInTheDocument();
    });
  });

  it('shows unpin button for admin', async () => {
    const msg = createMockMessage({ id: 'm1', content: 'Test' });
    mockApi.get.mockResolvedValueOnce({ data: { data: [msg] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Unpin')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    render(<PinnedMessagesPanel serverId="s1" channelId="c1" onClose={onClose} />);
    // Click the X button in the header - wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText(/pinned messages/i)).toBeInTheDocument();
    });
    // Click close on backdrop
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
