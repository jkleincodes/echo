import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { MESSAGE_INCLUDE, serializeMessage, aggregateReactions } from '../lib/serializers.js';
import { clearTypingForUser } from './typingHandler.js';
import { getSocketIdsForUser } from './presenceHandler.js';
import { shouldNotifyUser } from '../lib/notificationHelper.js';

const MAX_MESSAGE_LENGTH = 2000;

const channelJoinSchema = z.string().min(1);
const channelLeaveSchema = z.string().min(1);
const messageSendSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  replyToId: z.string().optional(),
});
const messageEditSchema = z.object({
  messageId: z.string().min(1),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
const messageDeleteSchema = z.object({
  messageId: z.string().min(1),
});
const reactionSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(64),
});

async function verifyChannelMembership(userId: string, channelId: string): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) return false;
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  return !!member;
}

// Parse @username mentions from content (including @everyone/@here)
async function parseMentions(content: string, channelId: string): Promise<{ userIds: string[]; mentionEveryone: boolean; mentionHere: boolean }> {
  const mentionRegex = /@(\w+)/g;
  const usernames: string[] = [];
  let mentionEveryone = false;
  let mentionHere = false;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const name = match[1];
    if (name === 'everyone') {
      mentionEveryone = true;
    } else if (name === 'here') {
      mentionHere = true;
    } else {
      usernames.push(name);
    }
  }

  if (usernames.length === 0) return { userIds: [], mentionEveryone, mentionHere };

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  return { userIds: users.map((u) => u.id), mentionEveryone, mentionHere };
}

export async function emitUnreadUpdates(
  io: Server,
  channelId: string,
  authorId: string,
  mentionedUserIds: string[],
  mentionEveryone: boolean = false,
  mentionHere: boolean = false,
) {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, name: true },
    });
    if (!channel) return;

    // Increment mention counts for mentioned users
    if (mentionedUserIds.length > 0) {
      await prisma.channelReadState.updateMany({
        where: { channelId, userId: { in: mentionedUserIds } },
        data: { mentionCount: { increment: 1 } },
      });
    }

    // Fetch author info and server name once for notification payloads
    const [author, server] = await Promise.all([
      prisma.user.findUnique({ where: { id: authorId }, select: { displayName: true, avatarUrl: true } }),
      prisma.server.findUnique({ where: { id: channel.serverId }, select: { name: true } }),
    ]);

    // Get all server members except the author
    const members = await prisma.member.findMany({
      where: { serverId: channel.serverId, userId: { not: authorId } },
      select: { userId: true },
    });

    for (const member of members) {
      const socketIds = getSocketIdsForUser(member.userId);
      if (socketIds.length === 0) continue;

      // Get read state for this user/channel
      const readState = await prisma.channelReadState.findUnique({
        where: { userId_channelId: { userId: member.userId, channelId } },
      });

      // If no read state exists, treat as "read" (0 unreads) to avoid flooding new members
      if (!readState) continue;

      // Count messages after lastReadMessageId (exclude thread messages)
      const whereClause: any = { channelId, threadId: null };
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
          channelId,
          serverId: channel.serverId,
          unreadCount,
          mentionCount: readState.mentionCount,
        });
      }

      // Check notification preferences and emit notification:push if appropriate
      const { shouldNotify } = await shouldNotifyUser(
        member.userId,
        channel.serverId,
        channelId,
        mentionedUserIds,
        mentionEveryone,
        mentionHere,
      );

      if (shouldNotify) {
        for (const sid of socketIds) {
          io.to(sid).emit('notification:push', {
            type: 'channel_message',
            title: `#${channel.name} - ${server?.name ?? 'Server'}`,
            body: `${author?.displayName ?? 'Someone'}: New message`,
            authorName: author?.displayName ?? 'Unknown',
            authorAvatarUrl: author?.avatarUrl ?? null,
            serverId: channel.serverId,
            channelId,
          });
        }
      }
    }
  } catch (err) {
    logger.error(err, 'Error emitting unread updates');
  }
}

export function registerChatHandler(io: Server, socket: Socket, userId: string) {
  socket.on('channel:join', async (channelId: unknown) => {
    const parsed = channelJoinSchema.safeParse(channelId);
    if (!parsed.success) return;

    const isMember = await verifyChannelMembership(userId, parsed.data);
    if (!isMember) {
      logger.warn({ userId, channelId: parsed.data }, 'Unauthorized channel:join attempt');
      return;
    }

    socket.join(`channel:${parsed.data}`);
    logger.debug({ userId, channelId: parsed.data }, 'User joined channel room');
  });

  socket.on('channel:leave', (channelId: unknown) => {
    const parsed = channelLeaveSchema.safeParse(channelId);
    if (!parsed.success) return;
    socket.leave(`channel:${parsed.data}`);
    logger.debug({ userId, channelId: parsed.data }, 'User left channel room');
  });

  socket.on('message:send', async (data: unknown, callback) => {
    try {
      const parsed = messageSendSchema.safeParse(data);
      if (!parsed.success) return;

      const { channelId, content: rawContent, replyToId } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      // Verify membership before allowing message send
      const isMember = await verifyChannelMembership(userId, channelId);
      if (!isMember) {
        logger.warn({ userId, channelId }, 'Unauthorized message:send attempt');
        return;
      }

      // Parse mentions
      const { userIds: mentionedUserIds, mentionEveryone, mentionHere } = await parseMentions(content, channelId);

      // Check if user has permission for @everyone/@here
      let allowSpecialMentions = false;
      if (mentionEveryone || mentionHere) {
        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (channel) {
          const member = await prisma.member.findUnique({
            where: { userId_serverId: { userId, serverId: channel.serverId } },
          });
          if (member && ['owner', 'admin'].includes(member.role)) {
            allowSpecialMentions = true;
          }
        }
      }

      const message = await prisma.message.create({
        data: {
          content,
          channelId,
          authorId: userId,
          replyToId: replyToId || null,
          mentions: mentionedUserIds.length > 0
            ? { create: mentionedUserIds.map((uid) => ({ userId: uid })) }
            : undefined,
        },
        include: MESSAGE_INCLUDE,
      });

      const payload = serializeMessage(message);
      // Append special mention markers to the mentions array
      if (allowSpecialMentions) {
        if (mentionEveryone) payload.mentions = [...(payload.mentions || []), 'everyone'];
        if (mentionHere) payload.mentions = [...(payload.mentions || []), 'here'];
      }

      io.to(`channel:${channelId}`).emit('message:new', payload);
      if (callback) callback(payload);

      // Clear typing indicator for the sender
      clearTypingForUser(io, channelId, userId);

      // Fire-and-forget unread updates
      emitUnreadUpdates(io, channelId, userId, mentionedUserIds, mentionEveryone, mentionHere);

      // Fire-and-forget embed generation
      generateEmbeds(io, message.id, channelId, content);
    } catch (err) {
      logger.error(err, 'Error sending message');
    }
  });

  socket.on('message:edit', async (data: unknown, callback) => {
    try {
      const parsed = messageEditSchema.safeParse(data);
      if (!parsed.success) return;

      const { messageId, content: rawContent } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      const existing = await prisma.message.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return;
      if (existing.type !== 'default') return;

      const message = await prisma.message.update({
        where: { id: messageId },
        data: { content, editedAt: new Date() },
        include: MESSAGE_INCLUDE,
      });

      const payload = serializeMessage(message);
      io.to(`channel:${message.channelId}`).emit('message:edited', payload);
      if (callback) callback(payload);
    } catch (err) {
      logger.error(err, 'Error editing message');
    }
  });

  socket.on('message:delete', async (data: unknown) => {
    try {
      const parsed = messageDeleteSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message || message.authorId !== userId) return;
      if (message.type !== 'default') return;

      await prisma.message.delete({ where: { id: parsed.data.messageId } });
      io.to(`channel:${message.channelId}`).emit('message:deleted', {
        messageId: parsed.data.messageId,
        channelId: message.channelId,
      });
    } catch (err) {
      logger.error(err, 'Error deleting message');
    }
  });

  // Reactions
  socket.on('message:react', async (data: unknown) => {
    try {
      const parsed = reactionSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message) return;

      await prisma.reaction.upsert({
        where: { userId_messageId_emoji: { userId, messageId: parsed.data.messageId, emoji: parsed.data.emoji } },
        create: { emoji: parsed.data.emoji, userId, messageId: parsed.data.messageId },
        update: {},
      });

      const reactions = await prisma.reaction.findMany({ where: { messageId: parsed.data.messageId } });
      io.to(`channel:${message.channelId}`).emit('message:reaction-updated', {
        messageId: parsed.data.messageId,
        channelId: message.channelId,
        reactions: aggregateReactions(reactions),
      });
    } catch (err) {
      logger.error(err, 'Error adding reaction');
    }
  });

  socket.on('message:unreact', async (data: unknown) => {
    try {
      const parsed = reactionSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
      if (!message) return;

      await prisma.reaction.deleteMany({
        where: { userId, messageId: parsed.data.messageId, emoji: parsed.data.emoji },
      });

      const reactions = await prisma.reaction.findMany({ where: { messageId: parsed.data.messageId } });
      io.to(`channel:${message.channelId}`).emit('message:reaction-updated', {
        messageId: parsed.data.messageId,
        channelId: message.channelId,
        reactions: aggregateReactions(reactions),
      });
    } catch (err) {
      logger.error(err, 'Error removing reaction');
    }
  });
}

export async function generateEmbeds(io: Server, messageId: string, channelId: string, content: string) {
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

    io.to(`channel:${channelId}`).emit('message:embeds-ready', {
      messageId,
      channelId,
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
    logger.debug(err, 'Embed generation failed (non-fatal)');
  }
}
