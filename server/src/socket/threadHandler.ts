import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { THREAD_MESSAGE_INCLUDE, serializeMessage, aggregateReactions } from '../lib/serializers.js';
import { getSocketIdsForUser } from './presenceHandler.js';
import { shouldNotifyUser } from '../lib/notificationHelper.js';

const MAX_MESSAGE_LENGTH = 2000;

const threadJoinSchema = z.string().min(1);
const threadMessageSendSchema = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  replyToId: z.string().optional(),
});
const threadMessageEditSchema = z.object({
  messageId: z.string().min(1),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
const threadMessageDeleteSchema = z.object({
  messageId: z.string().min(1),
});
const threadReactionSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(64),
});
const threadTypingSchema = z.object({
  threadId: z.string().min(1),
});

async function verifyThreadMembership(userId: string, threadId: string): Promise<{ channelId: string; serverId: string } | null> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { channel: { select: { serverId: true } } },
  });
  if (!thread) return null;
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId: thread.channel.serverId } },
  });
  if (!member) return null;
  return { channelId: thread.channelId, serverId: thread.channel.serverId };
}

// Parse @username mentions from content
async function parseMentions(content: string): Promise<string[]> {
  const mentionRegex = /@(\w+)/g;
  const usernames: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const name = match[1];
    if (name !== 'everyone' && name !== 'here') {
      usernames.push(name);
    }
  }
  if (usernames.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function emitThreadUnreadUpdates(io: Server, threadId: string, authorId: string, mentionedUserIds: string[]) {
  try {
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        channel: { select: { serverId: true, name: true } },
        participants: { select: { userId: true } },
      },
    });
    if (!thread) return;

    // Increment mention counts for mentioned users who are participants
    if (mentionedUserIds.length > 0) {
      await prisma.threadReadState.updateMany({
        where: { threadId, userId: { in: mentionedUserIds } },
        data: { mentionCount: { increment: 1 } },
      });
    }

    // Fetch author info and server name once for notification payloads
    const [author, server] = await Promise.all([
      prisma.user.findUnique({ where: { id: authorId }, select: { displayName: true, avatarUrl: true } }),
      prisma.server.findUnique({ where: { id: thread.channel.serverId }, select: { name: true } }),
    ]);

    // Notify all thread participants except the author
    for (const participant of thread.participants) {
      if (participant.userId === authorId) continue;

      const socketIds = getSocketIdsForUser(participant.userId);
      if (socketIds.length === 0) continue;

      const readState = await prisma.threadReadState.findUnique({
        where: { userId_threadId: { userId: participant.userId, threadId } },
      });
      if (!readState) continue;

      const whereClause: any = { threadId };
      if (readState.lastReadMessageId) {
        const lastReadMsg = await prisma.message.findUnique({
          where: { id: readState.lastReadMessageId },
          select: { createdAt: true },
        });
        if (lastReadMsg) {
          whereClause.createdAt = { gt: lastReadMsg.createdAt };
        }
      }

      const unreadCount = await prisma.message.count({ where: whereClause });

      for (const sid of socketIds) {
        io.to(sid).emit('unread:update', {
          channelId: threadId,
          serverId: thread.channel.serverId,
          threadId,
          unreadCount,
          mentionCount: readState.mentionCount,
        });
      }

      // Check notification preferences using the parent channel's server/channel
      const { shouldNotify } = await shouldNotifyUser(
        participant.userId,
        thread.channel.serverId,
        thread.channelId,
        mentionedUserIds,
        false, // threads don't support @everyone
        false, // threads don't support @here
      );

      if (shouldNotify) {
        for (const sid of socketIds) {
          io.to(sid).emit('notification:push', {
            type: 'thread_message',
            title: `Thread in #${thread.channel.name} - ${server?.name ?? 'Server'}`,
            body: `${author?.displayName ?? 'Someone'}: New message in ${thread.name}`,
            authorName: author?.displayName ?? 'Unknown',
            authorAvatarUrl: author?.avatarUrl ?? null,
            serverId: thread.channel.serverId,
            channelId: thread.channelId,
            threadId,
          });
        }
      }
    }
  } catch (err) {
    logger.error(err, 'Error emitting thread unread updates');
  }
}

// Thread typing state: threadId -> Map<userId, timeout>
const threadTypingState = new Map<string, Map<string, NodeJS.Timeout>>();
const TYPING_TIMEOUT = 5000;

export function registerThreadHandler(io: Server, socket: Socket, userId: string) {
  socket.on('thread:join', async (threadId: unknown) => {
    const parsed = threadJoinSchema.safeParse(threadId);
    if (!parsed.success) return;

    const membership = await verifyThreadMembership(userId, parsed.data);
    if (!membership) {
      logger.warn({ userId, threadId: parsed.data }, 'Unauthorized thread:join attempt');
      return;
    }

    socket.join(`thread:${parsed.data}`);
    logger.debug({ userId, threadId: parsed.data }, 'User joined thread room');
  });

  socket.on('thread:leave', (threadId: unknown) => {
    const parsed = threadJoinSchema.safeParse(threadId);
    if (!parsed.success) return;
    socket.leave(`thread:${parsed.data}`);
    logger.debug({ userId, threadId: parsed.data }, 'User left thread room');
  });

  socket.on('thread:message:send', async (data: unknown, callback) => {
    try {
      const parsed = threadMessageSendSchema.safeParse(data);
      if (!parsed.success) return;

      const { threadId, content: rawContent, replyToId } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      const membership = await verifyThreadMembership(userId, threadId);
      if (!membership) {
        logger.warn({ userId, threadId }, 'Unauthorized thread:message:send attempt');
        return;
      }

      // Parse mentions
      const mentionedUserIds = await parseMentions(content);

      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            content,
            channelId: membership.channelId,
            authorId: userId,
            threadId,
            replyToId: replyToId || null,
            mentions: mentionedUserIds.length > 0
              ? { create: mentionedUserIds.map((uid) => ({ userId: uid })) }
              : undefined,
          },
          include: THREAD_MESSAGE_INCLUDE,
        }),
        prisma.thread.update({
          where: { id: threadId },
          data: {
            lastActivityAt: new Date(),
            messageCount: { increment: 1 },
          },
        }),
        // Auto-add sender as participant
        prisma.threadParticipant.upsert({
          where: { threadId_userId: { threadId, userId } },
          create: { threadId, userId },
          update: {},
        }),
      ]);

      const payload = serializeMessage(message as any);
      io.to(`thread:${threadId}`).emit('thread:message:new', payload);
      if (callback) callback(payload);

      // Clear typing indicator for the sender in thread
      const threadTyping = threadTypingState.get(threadId);
      if (threadTyping) {
        const timeout = threadTyping.get(userId);
        if (timeout) {
          clearTimeout(timeout);
          threadTyping.delete(userId);
          if (threadTyping.size === 0) threadTypingState.delete(threadId);
          io.to(`thread:${threadId}`).emit('thread:typing:stop', { threadId, userId });
        }
      }

      // Get updated thread for the channel notification
      const updatedThread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { messageCount: true, lastActivityAt: true, starterMessageId: true },
      });

      // Notify parent channel about thread update
      io.to(`channel:${membership.channelId}`).emit('thread:updated', {
        threadId,
        channelId: membership.channelId,
        messageCount: updatedThread?.messageCount ?? 0,
        lastActivityAt: updatedThread?.lastActivityAt?.toISOString() ?? new Date().toISOString(),
        starterMessageId: updatedThread?.starterMessageId,
      });

      // Fire-and-forget unread updates
      emitThreadUnreadUpdates(io, threadId, userId, mentionedUserIds);

      // Fire-and-forget embed generation
      generateThreadEmbeds(io, message.id, threadId, content);
    } catch (err) {
      logger.error(err, 'Error sending thread message');
    }
  });

  socket.on('thread:message:edit', async (data: unknown, callback) => {
    try {
      const parsed = threadMessageEditSchema.safeParse(data);
      if (!parsed.success) return;

      const { messageId, content: rawContent } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      const existing = await prisma.message.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return;
      if (!existing.threadId) return;
      if (existing.type !== 'default') return;

      const message = await prisma.message.update({
        where: { id: messageId },
        data: { content, editedAt: new Date() },
        include: THREAD_MESSAGE_INCLUDE,
      });

      const payload = serializeMessage(message as any);
      io.to(`thread:${existing.threadId}`).emit('thread:message:edited', payload);
      if (callback) callback(payload);
    } catch (err) {
      logger.error(err, 'Error editing thread message');
    }
  });

  socket.on('thread:message:delete', async (data: unknown) => {
    try {
      const parsed = threadMessageDeleteSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message || message.authorId !== userId) return;
      if (!message.threadId) return;
      if (message.type !== 'default') return;

      const threadId = message.threadId;
      await prisma.$transaction([
        prisma.message.delete({ where: { id: parsed.data.messageId } }),
        prisma.thread.update({
          where: { id: threadId },
          data: { messageCount: { decrement: 1 } },
        }),
      ]);

      io.to(`thread:${threadId}`).emit('thread:message:deleted', {
        messageId: parsed.data.messageId,
        threadId,
      });
    } catch (err) {
      logger.error(err, 'Error deleting thread message');
    }
  });

  // Thread reactions
  socket.on('thread:message:react', async (data: unknown) => {
    try {
      const parsed = threadReactionSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message || !message.threadId) return;

      await prisma.reaction.upsert({
        where: { userId_messageId_emoji: { userId, messageId: parsed.data.messageId, emoji: parsed.data.emoji } },
        create: { emoji: parsed.data.emoji, userId, messageId: parsed.data.messageId },
        update: {},
      });

      const reactions = await prisma.reaction.findMany({ where: { messageId: parsed.data.messageId } });
      io.to(`thread:${message.threadId}`).emit('thread:message:reaction-updated', {
        messageId: parsed.data.messageId,
        threadId: message.threadId,
        reactions: aggregateReactions(reactions),
      });
    } catch (err) {
      logger.error(err, 'Error adding thread reaction');
    }
  });

  socket.on('thread:message:unreact', async (data: unknown) => {
    try {
      const parsed = threadReactionSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message || !message.threadId) return;

      await prisma.reaction.deleteMany({
        where: { userId, messageId: parsed.data.messageId, emoji: parsed.data.emoji },
      });

      const reactions = await prisma.reaction.findMany({ where: { messageId: parsed.data.messageId } });
      io.to(`thread:${message.threadId}`).emit('thread:message:reaction-updated', {
        messageId: parsed.data.messageId,
        threadId: message.threadId,
        reactions: aggregateReactions(reactions),
      });
    } catch (err) {
      logger.error(err, 'Error removing thread reaction');
    }
  });

  // Thread typing indicator
  socket.on('thread:typing:start', async (data: unknown) => {
    try {
      const parsed = threadTypingSchema.safeParse(data);
      if (!parsed.success) return;

      const { threadId } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      if (!user) return;

      if (!threadTypingState.has(threadId)) {
        threadTypingState.set(threadId, new Map());
      }
      const typing = threadTypingState.get(threadId)!;

      const existingTimeout = typing.get(userId);
      if (existingTimeout) clearTimeout(existingTimeout);

      const timeout = setTimeout(() => {
        typing.delete(userId);
        if (typing.size === 0) threadTypingState.delete(threadId);
        socket.to(`thread:${threadId}`).emit('thread:typing:stop', { threadId, userId });
      }, TYPING_TIMEOUT);

      const wasTyping = typing.has(userId);
      typing.set(userId, timeout);

      if (!wasTyping) {
        socket.to(`thread:${threadId}`).emit('thread:typing:start', {
          threadId,
          userId,
          username: user.displayName,
        });
      }
    } catch (err) {
      logger.error(err, 'Error handling thread:typing:start');
    }
  });

  socket.on('disconnect', () => {
    // Clear all thread typing states for this user
    for (const [threadId, typing] of threadTypingState.entries()) {
      const timeout = typing.get(userId);
      if (timeout) {
        clearTimeout(timeout);
        typing.delete(userId);
        if (typing.size === 0) threadTypingState.delete(threadId);
        socket.to(`thread:${threadId}`).emit('thread:typing:stop', { threadId, userId });
      }
    }
  });
}

async function generateThreadEmbeds(io: Server, messageId: string, threadId: string, content: string) {
  try {
    const { extractAndFetchEmbeds } = await import('../services/embedService.js');
    const embedData = await extractAndFetchEmbeds(content);
    if (embedData.length === 0) return;

    const embeds = await Promise.all(
      embedData.map((e) =>
        prisma.embed.create({
          data: { ...e, messageId },
        }),
      ),
    );

    io.to(`thread:${threadId}`).emit('thread:message:embeds-ready', {
      messageId,
      threadId,
      embeds: embeds.map((e) => ({
        id: e.id,
        url: e.url,
        title: e.title,
        description: e.description,
        imageUrl: e.imageUrl,
        siteName: e.siteName,
        favicon: e.favicon,
      })),
    });
  } catch (err) {
    logger.debug(err, 'Thread embed generation failed (non-fatal)');
  }
}
