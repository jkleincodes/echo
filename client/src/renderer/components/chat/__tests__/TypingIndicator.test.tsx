import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { render, screen } from '@testing-library/react';
import { useTypingStore } from '../../../stores/typingStore';
import { useAuthStore } from '../../../stores/authStore';
import TypingIndicator from '../TypingIndicator';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useAuthStore.setState({ user: createMockUser({ id: 'me' }), token: 'tok' });
});

describe('TypingIndicator', () => {
  it('renders empty space when no one is typing', () => {
    const { container } = render(<TypingIndicator channelId="c1" />);
    expect(container.firstChild).toHaveClass('h-6');
    expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
  });

  it('shows single user typing', () => {
    const typing = new Map([
      ['c1', new Map([['u2', { userId: 'u2', username: 'alice', timeout: setTimeout(() => {}, 5000) }]])],
    ]);
    useTypingStore.setState({ typing });
    render(<TypingIndicator channelId="c1" />);
    expect(screen.getByText(/alice is typing/i)).toBeInTheDocument();
  });

  it('shows two users typing', () => {
    const typing = new Map([
      ['c1', new Map([
        ['u2', { userId: 'u2', username: 'alice', timeout: setTimeout(() => {}, 5000) }],
        ['u3', { userId: 'u3', username: 'bob', timeout: setTimeout(() => {}, 5000) }],
      ])],
    ]);
    useTypingStore.setState({ typing });
    render(<TypingIndicator channelId="c1" />);
    expect(screen.getByText(/alice and bob are typing/i)).toBeInTheDocument();
  });

  it('shows "Several people are typing" for 3+ users', () => {
    const typing = new Map([
      ['c1', new Map([
        ['u2', { userId: 'u2', username: 'alice', timeout: setTimeout(() => {}, 5000) }],
        ['u3', { userId: 'u3', username: 'bob', timeout: setTimeout(() => {}, 5000) }],
        ['u4', { userId: 'u4', username: 'charlie', timeout: setTimeout(() => {}, 5000) }],
      ])],
    ]);
    useTypingStore.setState({ typing });
    render(<TypingIndicator channelId="c1" />);
    expect(screen.getByText(/several people are typing/i)).toBeInTheDocument();
  });

  it('excludes current user from typing display', () => {
    const typing = new Map([
      ['c1', new Map([['me', { userId: 'me', username: 'me', timeout: setTimeout(() => {}, 5000) }]])],
    ]);
    useTypingStore.setState({ typing });
    render(<TypingIndicator channelId="c1" />);
    expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
  });
});
