import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinServerModal from '../JoinServerModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('JoinServerModal', () => {
  const setup = () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<JoinServerModal onClose={onClose} />);
    return { onClose, user };
  };

  it('renders the modal with heading', () => {
    setup();
    expect(screen.getByText('Join a Server')).toBeInTheDocument();
  });

  it('shows step 1: invite code input and Look Up button', () => {
    setup();
    expect(screen.getByPlaceholderText('Enter invite code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look Up' })).toBeInTheDocument();
  });

  it('Look Up button is disabled when code is empty', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Look Up' });
    expect(btn).toBeDisabled();
  });

  it('enables Look Up button when code is entered', async () => {
    const { user } = setup();
    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    const btn = screen.getByRole('button', { name: 'Look Up' });
    expect(btn).toBeEnabled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', async () => {
    const { onClose, user } = setup();
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find(
      (b) => b.textContent !== 'Cancel' && b.textContent !== 'Look Up',
    );
    expect(xButton).toBeTruthy();
    await user.click(xButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fetches invite preview on Look Up submit', async () => {
    const { user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Test Server', memberCount: 5 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/api/invites/ABC123');
    });

    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument();
      expect(screen.getByText('5 members')).toBeInTheDocument();
    });
  });

  it('shows server preview with Join Server button on success', async () => {
    const { user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Test Server', memberCount: 5 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Join Server' })).toBeInTheDocument();
    });
  });

  it('shows singular "member" for memberCount === 1', async () => {
    const { user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Solo Server', memberCount: 1 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'SOLO');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByText('1 member')).toBeInTheDocument();
    });
  });

  it('shows Back button in preview step and returns to step 1', async () => {
    const { user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Test Server', memberCount: 5 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter invite code')).toBeInTheDocument();
    });
  });

  it('displays error for invalid/expired invite code', async () => {
    const { user } = setup();
    mockApi.get.mockRejectedValueOnce(new Error('not found'));

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'BADCODE');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired invite code')).toBeInTheDocument();
    });
  });

  it('calls join endpoint and onClose on successful join', async () => {
    const { onClose, user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Test Server', memberCount: 5 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Join Server' })).toBeInTheDocument();
    });

    const joinedServer = { id: 'srv-1', name: 'Test Server' };
    mockApi.post.mockResolvedValueOnce({ data: { data: joinedServer } });
    // fetchServers is called after join
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    // fetchServerDetails is called by setActiveServer
    mockApi.get.mockResolvedValueOnce({
      data: { data: { channels: [], categories: [], members: [], roles: [] } },
    });

    await user.click(screen.getByRole('button', { name: 'Join Server' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/invites/ABC123/join');
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error when join fails', async () => {
    const { user } = setup();
    mockApi.get.mockResolvedValueOnce({
      data: { data: { serverName: 'Test Server', memberCount: 5 } },
    });

    const input = screen.getByPlaceholderText('Enter invite code');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Look Up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Join Server' })).toBeInTheDocument();
    });

    mockApi.post.mockRejectedValueOnce(new Error('fail'));
    await user.click(screen.getByRole('button', { name: 'Join Server' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to join server')).toBeInTheDocument();
    });
  });
});
