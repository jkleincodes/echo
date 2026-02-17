import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockServer } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import CreateServerModal from '../CreateServerModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('CreateServerModal', () => {
  const setup = () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateServerModal onClose={onClose} />);
    return { onClose, user };
  };

  it('renders the modal with heading and description', () => {
    setup();
    expect(screen.getByText('Create a server')).toBeInTheDocument();
    expect(screen.getByText(/give your new server a personality/i)).toBeInTheDocument();
  });

  it('has a Server Name input with placeholder', () => {
    setup();
    const input = screen.getByPlaceholderText('My Awesome Server');
    expect(input).toBeInTheDocument();
  });

  it('has a Create button that is disabled when input is empty', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn).toBeDisabled();
  });

  it('enables Create button when name is entered', async () => {
    const { user } = setup();
    const input = screen.getByPlaceholderText('My Awesome Server');
    await user.type(input, 'Test Server');
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn).toBeEnabled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X close button is clicked', async () => {
    const { onClose, user } = setup();
    // The X button is the one in the header, not Cancel
    const buttons = screen.getAllByRole('button');
    // X button is the first non-Cancel, non-Create button
    const xButton = buttons.find(
      (b) => b.textContent !== 'Cancel' && b.textContent !== 'Create',
    );
    expect(xButton).toBeTruthy();
    await user.click(xButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = setup();
    // The backdrop is the outer fixed div
    const backdrop = screen.getByText('Create a server').closest('.fixed');
    expect(backdrop).toBeTruthy();
    // Click the backdrop directly (not the inner dialog)
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits form and calls createServer, setActiveServer, onClose on success', async () => {
    const { onClose, user } = setup();
    const mockServer = createMockServer({ id: 'srv-1', name: 'Test Server' });

    // Mock the store createServer action
    mockApi.post.mockResolvedValueOnce({ data: { data: mockServer } });
    // fetchServerDetails is called by setActiveServer
    mockApi.get.mockResolvedValueOnce({
      data: { data: { channels: [], categories: [], members: [], roles: [] } },
    });

    const input = screen.getByPlaceholderText('My Awesome Server');
    await user.type(input, 'Test Server');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/servers', { name: 'Test Server' });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows Creating... text while loading', async () => {
    const { user } = setup();

    // Never-resolving promise to keep loading state
    mockApi.post.mockReturnValueOnce(new Promise(() => {}));

    const input = screen.getByPlaceholderText('My Awesome Server');
    await user.type(input, 'Test Server');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('re-enables button on error', async () => {
    const { user } = setup();

    mockApi.post.mockRejectedValueOnce(new Error('fail'));

    const input = screen.getByPlaceholderText('My Awesome Server');
    await user.type(input, 'Test Server');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    });
  });
});
