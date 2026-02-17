import type { User, Server, Channel, Member, Message, DMChannel, DMParticipant, Friendship } from '@shared/types';
import { useAuthStore } from '@/stores/authStore';
import { useServerStore } from '@/stores/serverStore';
import { useMessageStore } from '@/stores/messageStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useTypingStore } from '@/stores/typingStore';
import { useUnreadStore } from '@/stores/unreadStore';
import { useDMStore } from '@/stores/dmStore';
import { useFriendStore } from '@/stores/friendStore';

// ── Fixture factories ──

let _id = 0;
const nextId = () => `test-${++_id}`;

export function createMockUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId();
  return {
    id,
    username: `user_${id}`,
    displayName: `User ${id}`,
    avatarUrl: null,
    status: 'online',
    ...overrides,
  };
}

export function createMockServer(overrides: Partial<Server> = {}): Server {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Server ${id}`,
    iconUrl: null,
    description: null,
    ownerId: 'owner-1',
    ...overrides,
  };
}

export function createMockChannel(overrides: Partial<Channel> = {}): Channel {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `channel-${id}`,
    type: 'text',
    topic: null,
    position: 0,
    serverId: 'server-1',
    categoryId: null,
    ...overrides,
  };
}

export function createMockMember(overrides: Partial<Member> = {}): Member {
  const id = overrides.id ?? nextId();
  const userId = overrides.userId ?? nextId();
  return {
    id,
    role: 'member',
    userId,
    serverId: 'server-1',
    user: createMockUser({ id: userId }),
    ...overrides,
  };
}

export function createMockMessage(overrides: Partial<Message> = {}): Message {
  const id = overrides.id ?? nextId();
  return {
    id,
    content: `Message ${id}`,
    channelId: 'channel-1',
    authorId: 'user-1',
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: createMockUser({ id: 'user-1' }),
    attachments: [],
    reactions: [],
    embeds: [],
    ...overrides,
  };
}

export function createMockDMChannel(overrides: Partial<DMChannel> = {}): DMChannel {
  const id = overrides.id ?? nextId();
  return {
    id,
    createdAt: new Date().toISOString(),
    participants: [],
    ...overrides,
  };
}

export function createMockFriendship(overrides: Partial<Friendship> = {}): Friendship {
  const id = overrides.id ?? nextId();
  return {
    id,
    status: 'accepted',
    senderId: 'user-1',
    receiverId: 'user-2',
    createdAt: new Date().toISOString(),
    sender: createMockUser({ id: 'user-1' }),
    receiver: createMockUser({ id: 'user-2' }),
    ...overrides,
  };
}

// ── Reset all stores ──

export function resetAllStores() {
  _id = 0;

  useAuthStore.setState({
    user: null,
    token: null,
    isLoading: false,
    error: null,
  });

  useServerStore.setState({
    servers: [],
    activeServerId: null,
    channels: [],
    categories: [],
    members: [],
    roles: [],
    activeChannelId: null,
    showHome: false,
  });

  useMessageStore.setState({
    messages: new Map(),
    cursors: new Map(),
    loading: new Map(),
    replyingTo: null,
    searchResults: [],
    searchLoading: false,
    searchCursor: null,
  });

  useVoiceStore.setState({
    connected: false,
    channelId: null,
    muted: false,
    deafened: false,
    speaking: new Map(),
    participants: [],
    channelParticipants: {},
  });

  usePresenceStore.setState({
    onlineUsers: new Set(),
  });

  useTypingStore.setState({
    typing: new Map(),
  });

  useUnreadStore.setState({
    unreads: new Map(),
  });

  useDMStore.setState({
    channels: [],
    activeDMChannelId: null,
    messages: new Map(),
    cursors: new Map(),
    loading: new Map(),
  });

  useFriendStore.setState({
    friends: [],
    pending: [],
    loading: false,
  });
}
