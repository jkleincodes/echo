import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/api.mock';
import { resetAllStores, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import ReactionBar from '../ReactionBar';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useAuthStore.setState({ user: createMockUser({ id: 'u1' }), token: 'tok' });
});

describe('ReactionBar', () => {
  it('returns null when no reactions', () => {
    const { container } = render(<ReactionBar messageId="m1" reactions={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders reaction buttons', () => {
    const reactions = [{ emoji: '👍', count: 3, userIds: ['u2', 'u3', 'u4'] }];
    render(<ReactionBar messageId="m1" reactions={reactions} />);
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles reaction on click - adds when not reacted', async () => {
    const user = userEvent.setup();
    const reactions = [{ emoji: '👍', count: 1, userIds: ['u2'] }];
    render(<ReactionBar messageId="m1" reactions={reactions} />);
    await user.click(screen.getByText('👍'));
    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', { messageId: 'm1', emoji: '👍' });
  });

  it('toggles reaction on click - removes when already reacted', async () => {
    const user = userEvent.setup();
    const reactions = [{ emoji: '👍', count: 2, userIds: ['u1', 'u2'] }];
    render(<ReactionBar messageId="m1" reactions={reactions} />);
    await user.click(screen.getByText('👍'));
    expect(mockSocket.emit).toHaveBeenCalledWith('message:unreact', { messageId: 'm1', emoji: '👍' });
  });

  it('shows add reaction button', () => {
    const reactions = [{ emoji: '👍', count: 1, userIds: ['u2'] }];
    render(<ReactionBar messageId="m1" reactions={reactions} />);
    // SmilePlus icon button
    expect(document.querySelector('button:last-child')).toBeInTheDocument();
  });
});
