import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/api.mock';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import {
  resetAllStores,
  createMockUser,
} from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import { useDMStore } from '../../../stores/dmStore';
import DMMessageList from '../DMMessageList';
import type { DMMessage } from '../../../../../../shared/types';

const author = createMockUser({ id: 'alice', displayName: 'Alice', avatarUrl: null });

function createDMMessage(overrides: Partial<DMMessage> = {}): DMMessage {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`,
    content: overrides.content ?? 'Hello',
    channelId: overrides.channelId ?? 'dm-1',
    authorId: overrides.authorId ?? 'alice',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    editedAt: overrides.editedAt ?? null,
    author: overrides.author ?? author,
  };
}

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('DMMessageList', () => {
  it('calls fetchMessages on mount with channelId', () => {
    const fetchMessages = vi.fn();
    useDMStore.setState({ fetchMessages } as any);
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    expect(fetchMessages).toHaveBeenCalledWith('dm-1');
  });

  it('emits dm:join on mount and dm:leave on unmount', () => {
    const { unmount } = renderWithRouter(<DMMessageList channelId="dm-1" />);
    expect(mockSocket.emit).toHaveBeenCalledWith('dm:join', 'dm-1');

    unmount();
    expect(mockSocket.emit).toHaveBeenCalledWith('dm:leave', 'dm-1');
  });

  it('shows loading spinner when loading is true', () => {
    const loading = new Map([['dm-1', true]]);
    useDMStore.setState({ loading });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    // The spinner has the animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show spinner when loading is false', () => {
    const loading = new Map([['dm-1', false]]);
    useDMStore.setState({ loading });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('renders messages from the store', () => {
    const messages = new Map([
      [
        'dm-1',
        [
          createDMMessage({ id: 'm1', content: 'Hello from Alice', channelId: 'dm-1' }),
          createDMMessage({ id: 'm2', content: 'How are you?', channelId: 'dm-1' }),
        ],
      ],
    ]);
    useDMStore.setState({ messages });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    expect(screen.getByText('Hello from Alice')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('shows author display name on first message in a group', () => {
    const messages = new Map([
      ['dm-1', [createDMMessage({ id: 'm1', content: 'Hi', channelId: 'dm-1' })]],
    ]);
    useDMStore.setState({ messages });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('groups consecutive messages by same author within 5 minutes', () => {
    const now = new Date();
    const twoMinLater = new Date(now.getTime() + 2 * 60 * 1000);
    const messages = new Map([
      [
        'dm-1',
        [
          createDMMessage({
            id: 'm1',
            content: 'First message',
            channelId: 'dm-1',
            createdAt: now.toISOString(),
          }),
          createDMMessage({
            id: 'm2',
            content: 'Second message',
            channelId: 'dm-1',
            createdAt: twoMinLater.toISOString(),
          }),
        ],
      ],
    ]);
    useDMStore.setState({ messages });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    // Author name should appear only once since both messages are within 5 minutes
    const authorLabels = screen.getAllByText('Alice');
    expect(authorLabels).toHaveLength(1);
  });

  it('shows new header when messages are more than 5 minutes apart', () => {
    const now = new Date();
    const sixMinLater = new Date(now.getTime() + 6 * 60 * 1000);
    const messages = new Map([
      [
        'dm-1',
        [
          createDMMessage({
            id: 'm1',
            content: 'First message',
            channelId: 'dm-1',
            createdAt: now.toISOString(),
          }),
          createDMMessage({
            id: 'm2',
            content: 'Later message',
            channelId: 'dm-1',
            createdAt: sixMinLater.toISOString(),
          }),
        ],
      ],
    ]);
    useDMStore.setState({ messages });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    // Author name should appear twice since messages are >5 min apart
    const authorLabels = screen.getAllByText('Alice');
    expect(authorLabels).toHaveLength(2);
  });

  it('shows new header when author changes', () => {
    const bob = createMockUser({ id: 'bob', displayName: 'Bob', avatarUrl: null });
    const now = new Date();
    const messages = new Map([
      [
        'dm-1',
        [
          createDMMessage({
            id: 'm1',
            content: 'Hello from Alice',
            channelId: 'dm-1',
            authorId: 'alice',
            author,
            createdAt: now.toISOString(),
          }),
          createDMMessage({
            id: 'm2',
            content: 'Hello from Bob',
            channelId: 'dm-1',
            authorId: 'bob',
            author: bob,
            createdAt: now.toISOString(),
          }),
        ],
      ],
    ]);
    useDMStore.setState({ messages });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty state when no messages exist for channel', () => {
    useDMStore.setState({ messages: new Map() });
    renderWithRouter(<DMMessageList channelId="dm-1" />);
    // Should render without errors and have no message content
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });
});
