import type { Message as PrismaMessage, Attachment, Reaction, Embed, User, Mention, Thread as PrismaThread, ThreadParticipant } from '@prisma/client';
import type { Message, Reaction as ReactionDTO, Thread, ThreadSummary } from '../../../shared/types.js';

type PrismaMessageWithRelations = PrismaMessage & {
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'status'>;
  attachments: Attachment[];
  reactions: Reaction[];
  embeds: Embed[];
  replyTo?: {
    id: string;
    content: string;
    author: Pick<User, 'id' | 'username' | 'displayName'>;
  } | null;
  mentions?: Mention[];
  startedThread?: (PrismaThread & {
    participants: (ThreadParticipant & { user: Pick<User, 'id' | 'avatarUrl'> })[];
  }) | null;
  webhook?: { id: string; name: string; avatarUrl: string | null } | null;
};

export const MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
  attachments: true,
  reactions: true,
  embeds: true,
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: { id: true, username: true, displayName: true } },
    },
  },
  mentions: true,
  startedThread: {
    include: {
      participants: {
        take: 5,
        include: { user: { select: { id: true, avatarUrl: true } } },
      },
    },
  },
  webhook: { select: { id: true, name: true, avatarUrl: true } },
} as const;

// Same as MESSAGE_INCLUDE but without startedThread (for messages inside threads to avoid recursion)
export const THREAD_MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
  attachments: true,
  reactions: true,
  embeds: true,
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: { id: true, username: true, displayName: true } },
    },
  },
  mentions: true,
  webhook: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export function aggregateReactions(reactions: Reaction[]): ReactionDTO[] {
  const map = new Map<string, { emoji: string; userIds: string[] }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji);
    if (entry) {
      entry.userIds.push(r.userId);
    } else {
      map.set(r.emoji, { emoji: r.emoji, userIds: [r.userId] });
    }
  }
  return Array.from(map.values()).map((e) => ({
    emoji: e.emoji,
    count: e.userIds.length,
    userIds: e.userIds,
  }));
}

export function serializeMessage(msg: PrismaMessageWithRelations): Message {
  const result: Message = {
    id: msg.id,
    content: msg.content,
    type: (msg as any).type || 'default',
    channelId: msg.channelId,
    authorId: msg.authorId,
    threadId: msg.threadId ?? null,
    createdAt: msg.createdAt.toISOString(),
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    author: msg.author as Message['author'],
    attachments: msg.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `/uploads/${a.storedAs}`,
      mimeType: a.mimeType,
      size: a.size,
    })),
    reactions: aggregateReactions(msg.reactions),
    embeds: msg.embeds.map((e) => ({
      id: e.id,
      url: e.url,
      title: e.title,
      description: e.description,
      imageUrl: e.imageUrl,
      siteName: e.siteName,
      favicon: e.favicon,
    })),
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          content: msg.replyTo.content,
          author: msg.replyTo.author,
        }
      : null,
    pinnedAt: msg.pinnedAt ? msg.pinnedAt.toISOString() : null,
    pinnedById: msg.pinnedById ?? null,
    mentions: msg.mentions ? msg.mentions.map((m) => m.userId) : [],
    webhookId: msg.webhookId ?? null,
    webhookName: msg.webhook?.name ?? null,
    webhookAvatarUrl: msg.webhook?.avatarUrl ?? null,
  };

  if (msg.startedThread) {
    result.thread = {
      id: msg.startedThread.id,
      name: msg.startedThread.name,
      messageCount: msg.startedThread.messageCount,
      lastActivityAt: msg.startedThread.lastActivityAt.toISOString(),
      participantCount: msg.startedThread.participants.length,
      participantAvatars: msg.startedThread.participants.map((p) => p.user.avatarUrl || ''),
    };
  }

  return result;
}

type PrismaThreadWithRelations = PrismaThread & {
  creator: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  participants: (ThreadParticipant & { user: Pick<User, 'id' | 'avatarUrl'> })[];
  messages?: (PrismaMessage & {
    author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'status'>;
    attachments: Attachment[];
    reactions: Reaction[];
    embeds: Embed[];
    mentions?: Mention[];
  })[];
};

export function serializeThread(thread: PrismaThreadWithRelations): Thread {
  const lastMsg = thread.messages && thread.messages.length > 0 ? thread.messages[0] : null;
  return {
    id: thread.id,
    name: thread.name,
    channelId: thread.channelId,
    starterMessageId: thread.starterMessageId,
    creatorId: thread.creatorId,
    archived: thread.archived,
    lastActivityAt: thread.lastActivityAt.toISOString(),
    messageCount: thread.messageCount,
    createdAt: thread.createdAt.toISOString(),
    creator: thread.creator,
    lastMessage: lastMsg ? serializeMessage(lastMsg as PrismaMessageWithRelations) : null,
    participantCount: thread.participants.length,
    participantAvatars: thread.participants.map((p) => p.user.avatarUrl || ''),
  };
}
