import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getSocketIdsForUser } from './presenceHandler.js';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, status: true };

const dmChannelIdSchema = z.string().min(1);
const dmSendSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
const dmEditSchema = z.object({
  messageId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
const dmDeleteSchema = z.object({
  messageId: z.string().min(1),
});
const dmTypingSchema = z.object({
  channelId: z.string().min(1),
});

// Track DM typing state
const dmTypingState = new Map<string, Map<string, NodeJS.Timeout>>();
const DM_TYPING_TIMEOUT = 5000;

export function registerDMHandler(io: Server, socket: Socket, userId: string) {
  // Auto-join DM rooms on connect
  joinDMRooms(socket, userId);

  socket.on('dm:join', async (channelId: unknown) => {
    const parsed = dmChannelIdSchema.safeParse(channelId);
    if (!parsed.success) return;

    // Verify user is a participant in this DM channel
    const participant = await prisma.dMParticipant.findUnique({
      where: { userId_channelId: { userId, channelId: parsed.data } },
    });
    if (!participant) {
      logger.warn({ userId, channelId: parsed.data }, 'Unauthorized dm:join attempt');
      return;
    }

    socket.join(`dm:${parsed.data}`);
  });

  socket.on('dm:leave', (channelId: unknown) => {
    const parsed = dmChannelIdSchema.safeParse(channelId);
    if (!parsed.success) return;
    socket.leave(`dm:${parsed.data}`);
  });

  socket.on('dm:send', async (data: unknown, callback) => {
    try {
      const parsed = dmSendSchema.safeParse(data);
      if (!parsed.success) return;

      const { channelId, content: rawContent } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      // Verify user is participant
      const participant = await prisma.dMParticipant.findUnique({
        where: { userId_channelId: { userId, channelId } },
      });
      if (!participant) return;

      const message = await prisma.dMMessage.create({
        data: {
          content,
          channelId,
          authorId: userId,
        },
        include: {
          author: { select: USER_SELECT },
        },
      });

      const payload = {
        id: message.id,
        content: message.content,
        channelId: message.channelId,
        authorId: message.authorId,
        createdAt: message.createdAt.toISOString(),
        editedAt: null,
        author: message.author,
      };

      io.to(`dm:${channelId}`).emit('dm:message', payload);
      if (callback) callback(payload);

      // Fire-and-forget DM unread updates
      emitDMUnreadUpdates(io, channelId, userId);
    } catch (err) {
      logger.error(err, 'Error sending DM');
    }
  });

  socket.on('dm:edit', async (data: unknown, callback) => {
    try {
      const parsed = dmEditSchema.safeParse(data);
      if (!parsed.success) return;

      const { messageId, content: rawContent } = parsed.data;
      const content = rawContent.trim();
      if (!content) return;

      const existing = await prisma.dMMessage.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return;

      const message = await prisma.dMMessage.update({
        where: { id: messageId },
        data: { content, editedAt: new Date() },
        include: { author: { select: USER_SELECT } },
      });

      const payload = {
        id: message.id,
        content: message.content,
        channelId: message.channelId,
        authorId: message.authorId,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        author: message.author,
      };

      io.to(`dm:${message.channelId}`).emit('dm:edited', payload);
      if (callback) callback(payload);
    } catch (err) {
      logger.error(err, 'Error editing DM');
    }
  });

  socket.on('dm:delete', async (data: unknown) => {
    try {
      const parsed = dmDeleteSchema.safeParse(data);
      if (!parsed.success) return;

      const message = await prisma.dMMessage.findUnique({ where: { id: parsed.data.messageId } });
      if (!message || message.authorId !== userId) return;

      await prisma.dMMessage.delete({ where: { id: parsed.data.messageId } });
      io.to(`dm:${message.channelId}`).emit('dm:deleted', {
        messageId: parsed.data.messageId,
        channelId: message.channelId,
      });
    } catch (err) {
      logger.error(err, 'Error deleting DM');
    }
  });

  socket.on('dm:typing-start', async (data: unknown) => {
    try {
      const parsed = dmTypingSchema.safeParse(data);
      if (!parsed.success) return;

      const { channelId } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      if (!user) return;

      if (!dmTypingState.has(channelId)) {
        dmTypingState.set(channelId, new Map());
      }
      const channelTyping = dmTypingState.get(channelId)!;

      const existingTimeout = channelTyping.get(userId);
      if (existingTimeout) clearTimeout(existingTimeout);

      const timeout = setTimeout(() => {
        channelTyping.delete(userId);
        if (channelTyping.size === 0) dmTypingState.delete(channelId);
        socket.to(`dm:${channelId}`).emit('dm:typing-stop', { channelId, userId });
      }, DM_TYPING_TIMEOUT);

      const wasTyping = channelTyping.has(userId);
      channelTyping.set(userId, timeout);

      if (!wasTyping) {
        socket.to(`dm:${channelId}`).emit('dm:typing-start', {
          channelId,
          userId,
          username: user.displayName,
        });
      }
    } catch (err) {
      logger.error(err, 'Error handling dm:typing-start');
    }
  });

  socket.on('disconnect', () => {
    for (const [channelId, channelTyping] of dmTypingState.entries()) {
      const timeout = channelTyping.get(userId);
      if (timeout) {
        clearTimeout(timeout);
        channelTyping.delete(userId);
        if (channelTyping.size === 0) dmTypingState.delete(channelId);
        socket.to(`dm:${channelId}`).emit('dm:typing-stop', { channelId, userId });
      }
    }
  });
}

async function emitDMUnreadUpdates(io: Server, channelId: string, authorId: string) {
  try {
    // Get all participants except the author
    const participants = await prisma.dMParticipant.findMany({
      where: { channelId, userId: { not: authorId } },
      select: { userId: true },
    });

    // Fetch author info once for notification payloads
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { displayName: true, avatarUrl: true },
    });

    for (const participant of participants) {
      const socketIds = getSocketIdsForUser(participant.userId);
      if (socketIds.length === 0) continue;

      // Get read state for this user
      const readState = await prisma.dMChannelReadState.findUnique({
        where: { userId_channelId: { userId: participant.userId, channelId } },
      });

      // For DMs, if no read state exists, count all messages as unread
      let unreadCount: number;
      if (readState?.lastReadMessageId) {
        const lastReadMsg = await prisma.dMMessage.findUnique({
          where: { id: readState.lastReadMessageId },
          select: { createdAt: true },
        });
        if (lastReadMsg) {
          unreadCount = await prisma.dMMessage.count({
            where: { channelId, createdAt: { gt: lastReadMsg.createdAt } },
          });
        } else {
          unreadCount = await prisma.dMMessage.count({ where: { channelId } });
        }
      } else {
        unreadCount = await prisma.dMMessage.count({ where: { channelId } });
      }

      for (const sid of socketIds) {
        io.to(sid).emit('unread:update', {
          channelId,
          serverId: null,
          unreadCount,
          mentionCount: 0,
        });
      }

      // DMs always notify — no server/channel preferences apply
      for (const sid of socketIds) {
        io.to(sid).emit('notification:push', {
          type: 'dm_message',
          title: author?.displayName ?? 'Direct Message',
          body: 'Sent you a message',
          authorName: author?.displayName ?? 'Unknown',
          authorAvatarUrl: author?.avatarUrl ?? null,
          channelId,
        });
      }
    }
  } catch (err) {
    logger.error(err, 'Error emitting DM unread updates');
  }
}

async function joinDMRooms(socket: Socket, userId: string) {
  try {
    const participants = await prisma.dMParticipant.findMany({
      where: { userId },
      select: { channelId: true },
    });
    for (const p of participants) {
      socket.join(`dm:${p.channelId}`);
    }
  } catch (err) {
    logger.error(err, 'Error joining DM rooms');
  }
}
