import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockMessage, createMockUser, createMockMember } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import { useServerStore } from '../../../stores/serverStore';
import MessageItem from '../MessageItem';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  const user = createMockUser({ id: 'u1', displayName: 'Alice' });
  useAuthStore.setState({ user, token: 'tok' });
  useServerStore.setState({ members: [createMockMember({ userId: 'u1', role: 'owner', user })] });
});

describe('MessageItem', () => {
  it('renders message content', () => {
    const msg = createMockMessage({ content: 'Hello world', showHeader: true });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders author name when showHeader is true', () => {
    const author = createMockUser({ id: 'u2', displayName: 'Bob' });
    const msg = createMockMessage({ author, authorId: 'u2' });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows reply button', () => {
    const msg = createMockMessage({});
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByTitle('Reply')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for own messages', () => {
    const msg = createMockMessage({ authorId: 'u1' });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('does not show edit/delete for others messages', () => {
    const author = createMockUser({ id: 'u2' });
    const msg = createMockMessage({ authorId: 'u2', author });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('emits message:delete on delete click', async () => {
    const u = userEvent.setup();
    const msg = createMockMessage({ id: 'msg1', authorId: 'u1' });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    await u.click(screen.getByTitle('Delete'));
    expect(mockSocket.emit).toHaveBeenCalledWith('message:delete', { messageId: 'msg1' });
  });

  it('renders system message correctly', () => {
    const msg = createMockMessage({ type: 'system_join', content: 'Alice joined the server' });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('Alice joined the server')).toBeInTheDocument();
  });

  it('shows (edited) label for edited messages', () => {
    const msg = createMockMessage({ editedAt: new Date().toISOString() });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('shows reply preview when message has replyTo', () => {
    const replyAuthor = { id: 'u2', username: 'bob', displayName: 'Bob' };
    const msg = createMockMessage({
      replyTo: { id: 'r1', content: 'Original message', author: replyAuthor },
    });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Original message')).toBeInTheDocument();
  });

  it('shows pinned indicator', () => {
    const msg = createMockMessage({ pinnedAt: new Date().toISOString() });
    renderWithRouter(<MessageItem message={msg} showHeader />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });
});
