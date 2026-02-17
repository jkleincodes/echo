import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCategoryModal from '../CreateCategoryModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('CreateCategoryModal', () => {
  const serverId = 'server-1';

  const setup = () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateCategoryModal serverId={serverId} onClose={onClose} />);
    return { onClose, user };
  };

  it('renders the modal with heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Create Category' })).toBeInTheDocument();
  });

  it('shows description text', () => {
    setup();
    expect(screen.getByText(/categories help organize/i)).toBeInTheDocument();
  });

  it('has a Category Name input with placeholder', () => {
    setup();
    const input = screen.getByPlaceholderText('New Category');
    expect(input).toBeInTheDocument();
  });

  it('has Create Category button disabled when input is empty', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Create Category' });
    expect(btn).toBeDisabled();
  });

  it('enables Create Category button when name is entered', async () => {
    const { user } = setup();
    const input = screen.getByPlaceholderText('New Category');
    await user.type(input, 'Text Channels');
    const btn = screen.getByRole('button', { name: 'Create Category' });
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
      (b) => b.textContent !== 'Cancel' && b.textContent !== 'Create Category',
    );
    expect(xButton).toBeTruthy();
    await user.click(xButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = setup();
    const backdrop = screen.getByRole('heading', { name: 'Create Category' }).closest('.fixed');
    expect(backdrop).toBeTruthy();
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits form and calls createCategory with correct args', async () => {
    const { onClose, user } = setup();
    const mockCategory = { id: 'cat-1', name: 'Text Channels', position: 0, serverId };
    mockApi.post.mockResolvedValueOnce({ data: { data: mockCategory } });

    const input = screen.getByPlaceholderText('New Category');
    await user.type(input, 'Text Channels');
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(`/api/servers/${serverId}/categories`, {
        name: 'Text Channels',
      });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows Creating... while loading', async () => {
    const { user } = setup();
    mockApi.post.mockReturnValueOnce(new Promise(() => {}));

    const input = screen.getByPlaceholderText('New Category');
    await user.type(input, 'Text Channels');
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('re-enables button on error', async () => {
    const { user } = setup();
    mockApi.post.mockRejectedValueOnce(new Error('fail'));

    const input = screen.getByPlaceholderText('New Category');
    await user.type(input, 'Text Channels');
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Category' })).toBeEnabled();
    });
  });
});
