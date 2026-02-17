import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockMessage, createMockUser, createMockChannel } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useServerStore } from '../../../stores/serverStore';
import { useMessageStore } from '../../../stores/messageStore';
import SearchPanel from '../SearchPanel';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useServerStore.setState({ channels: [createMockChannel({ id: 'c1', name: 'general' })] });
});

describe('SearchPanel', () => {
  it('renders search input', () => {
    render(<SearchPanel serverId="s1" onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search messages...')).toBeInTheDocument();
  });

  it('shows initial prompt text', () => {
    render(<SearchPanel serverId="s1" onClose={vi.fn()} />);
    expect(screen.getByText(/start typing to search/i)).toBeInTheDocument();
  });

  it('performs search after debounce', async () => {
    // Mock the store search to resolve immediately
    mockApi.get.mockResolvedValue({ data: { data: [], nextCursor: null } });

    render(<SearchPanel serverId="s1" onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search messages...');

    fireEvent.change(input, { target: { value: 'hello' } });

    // Wait for the 300ms debounce and API call to resolve
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('/api/servers/s1/search'));
    }, { timeout: 2000 });
  });

  it('shows no results message', async () => {
    mockApi.get.mockResolvedValue({ data: { data: [], nextCursor: null } });

    render(<SearchPanel serverId="s1" onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search messages...');

    fireEvent.change(input, { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('calls onClose on close button click', () => {
    const onClose = vi.fn();
    render(<SearchPanel serverId="s1" onClose={onClose} />);

    // The close button is inside the header's border-b container
    const closeBtn = document.querySelector('.border-b button') as HTMLElement;
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }
    expect(onClose).toHaveBeenCalled();
  });
});
