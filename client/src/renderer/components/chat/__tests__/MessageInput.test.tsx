import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockUser, createMockMessage } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import { useMessageStore } from '../../../stores/messageStore';
import { useServerStore } from '../../../stores/serverStore';
import MessageInput from '../MessageInput';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useAuthStore.setState({ user: createMockUser({ id: 'u1' }), token: 'tok' });
  useServerStore.setState({ members: [] });
});

describe('MessageInput', () => {
  it('renders textarea with placeholder', () => {
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument();
  });

  it('sends message on Enter', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'Hello world{Enter}');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'message:send',
      expect.objectContaining({ channelId: 'c1', content: 'Hello world' }),
      expect.any(Function),
    );
  });

  it('does not send empty message', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, '{Enter}');
    expect(mockSocket.emit).not.toHaveBeenCalledWith('message:send', expect.anything(), expect.anything());
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    const textarea = screen.getByPlaceholderText('Message #general') as HTMLTextAreaElement;
    await user.type(textarea, 'Hello{Enter}');
    expect(textarea.value).toBe('');
  });

  it('emits typing event on input change', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'H');
    expect(mockSocket.emit).toHaveBeenCalledWith('typing:start', { channelId: 'c1' });
  });

  it('shows reply banner when replying', async () => {
    const replyMsg = createMockMessage({ id: 'r1', content: 'Reply to this', author: createMockUser({ id: 'u2', displayName: 'Bob' }) });
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    // Set replyingTo AFTER mount so the channelId useEffect has already cleared it
    await act(async () => {
      useMessageStore.setState({ replyingTo: replyMsg });
    });
    expect(screen.getByText(/replying to/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('has file upload button', () => {
    renderWithRouter(<MessageInput channelId="c1" channelName="general" serverId="s1" />);
    // The PlusCircle icon button exists as file upload trigger
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });
});
