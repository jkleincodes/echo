import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockChannel } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateChannelModal from '../CreateChannelModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('CreateChannelModal', () => {
  const serverId = 'server-1';

  const setup = () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateChannelModal serverId={serverId} onClose={onClose} />);
    return { onClose, user };
  };

  it('renders the modal with heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Create Channel' })).toBeInTheDocument();
  });

  it('has radio buttons for Text and Voice channel type', () => {
    setup();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Voice')).toBeInTheDocument();
  });

  it('defaults to Text channel type', () => {
    setup();
    expect(screen.getByText('Send messages, images, GIFs, and more')).toBeInTheDocument();
  });

  it('can select Voice channel type', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Voice'));
    expect(screen.getByText('Hang out together with voice')).toBeInTheDocument();
  });

  it('has Channel Name input with placeholder', () => {
    setup();
    const input = screen.getByPlaceholderText('new-channel');
    expect(input).toBeInTheDocument();
  });

  it('has Create Channel button disabled when input is empty', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Create Channel' });
    expect(btn).toBeDisabled();
  });

  it('enables Create Channel button when name is entered', async () => {
    const { user } = setup();
    const input = screen.getByPlaceholderText('new-channel');
    await user.type(input, 'general');
    const btn = screen.getByRole('button', { name: 'Create Channel' });
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
      (b) =>
        b.textContent !== 'Cancel' &&
        b.textContent !== 'Create Channel' &&
        !b.textContent?.includes('Text') &&
        !b.textContent?.includes('Voice'),
    );
    expect(xButton).toBeTruthy();
    await user.click(xButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits text channel and calls createChannel with correct args', async () => {
    const { onClose, user } = setup();
    const mockChannel = createMockChannel({ id: 'ch-1', name: 'general', type: 'text' });
    mockApi.post.mockResolvedValueOnce({ data: { data: mockChannel } });

    const input = screen.getByPlaceholderText('new-channel');
    await user.type(input, 'general');
    await user.click(screen.getByRole('button', { name: 'Create Channel' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(`/api/servers/${serverId}/channels`, {
        name: 'general',
        type: 'text',
        categoryId: undefined,
      });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('submits voice channel when Voice type is selected', async () => {
    const { onClose, user } = setup();
    const mockChannel = createMockChannel({ id: 'ch-2', name: 'voice-chat', type: 'voice' });
    mockApi.post.mockResolvedValueOnce({ data: { data: mockChannel } });

    await user.click(screen.getByText('Voice'));

    const input = screen.getByPlaceholderText('new-channel');
    await user.type(input, 'Voice Chat');
    await user.click(screen.getByRole('button', { name: 'Create Channel' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(`/api/servers/${serverId}/channels`, {
        name: 'voice-chat',
        type: 'voice',
        categoryId: undefined,
      });
    });
  });

  it('shows Creating... while loading', async () => {
    const { user } = setup();
    mockApi.post.mockReturnValueOnce(new Promise(() => {}));

    const input = screen.getByPlaceholderText('new-channel');
    await user.type(input, 'general');
    await user.click(screen.getByRole('button', { name: 'Create Channel' }));

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('re-enables button on error', async () => {
    const { user } = setup();
    mockApi.post.mockRejectedValueOnce(new Error('fail'));

    const input = screen.getByPlaceholderText('new-channel');
    await user.type(input, 'general');
    await user.click(screen.getByRole('button', { name: 'Create Channel' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Channel' })).toBeEnabled();
    });
  });
});
