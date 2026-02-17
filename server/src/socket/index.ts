import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { registerChatHandler } from './chatHandler.js';
import { registerPresenceHandler, getOnlineUserIds } from './presenceHandler.js';
import { registerVoiceHandler, getAllVoiceChannelUsers, getAllVoiceStates, getAllMediaStates, startAfkChecker } from './voiceHandler.js';
import { registerTypingHandler } from './typingHandler.js';
import { registerDMHandler } from './dmHandler.js';
import { registerSoundboardHandler } from './soundboardHandler.js';
import { registerThreadHandler } from './threadHandler.js';
import { logger } from '../lib/logger.js';
import { JWT_SECRET } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    logger.info({ userId, socketId: socket.id }, 'Socket connected');

    registerChatHandler(io, socket, userId);
    registerPresenceHandler(io, socket, userId);
    registerVoiceHandler(io, socket, userId);
    registerTypingHandler(io, socket, userId);
    registerDMHandler(io, socket, userId);
    registerSoundboardHandler(io, socket, userId);
    registerThreadHandler(io, socket, userId);

    // Send current online users (after registerPresenceHandler so own user is included)
    socket.emit('presence:online-users', getOnlineUserIds());

    // Send current voice channel participants
    const voiceState = getAllVoiceChannelUsers();
    socket.emit('voice:channel-participants', voiceState);

    // Send current voice states (muted/deafened) for all users
    socket.emit('voice:all-voice-states', getAllVoiceStates());

    // Send current media states (camera/screen) for all users
    socket.emit('voice:all-media-states', getAllMediaStates());

    // Client can request a full voice state sync at any time
    socket.on('voice:request-sync', () => {
      socket.emit('voice:channel-participants', getAllVoiceChannelUsers());
      socket.emit('voice:all-voice-states', getAllVoiceStates());
      socket.emit('voice:all-media-states', getAllMediaStates());
    });

    // Send initial unread state
    emitInitialUnreads(socket, userId);

    socket.on('disconnect', () => {
      logger.info({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  // Periodic voice state sync — recovers from any missed join/leave events
  setInterval(() => {
    const participants = getAllVoiceChannelUsers();
    io.emit('voice:channel-participants', participants);
  }, 15_000);

  // Start AFK checker
  startAfkChecker(io);

  return io;
}

async function emitInitialUnreads(socket: Socket, userId: string) {
  try {
    const unreads: Array<{ channelId: string; serverId: string | null; unreadCount: number; mentionCount: number }> = [];

    // Server channel unreads — only for channels with existing read state
    const channelReadStates = await prisma.channelReadState.findMany({
      where: { userId },
      include: { channel: { select: { id: true, serverId: true } } },
    });

    for (const rs of channelReadStates) {
      let unreadCount = 0;
      if (rs.lastReadMessageId) {
        const lastReadMsg = await prisma.message.findUnique({
          where: { id: rs.lastReadMessageId },
          select: { createdAt: true },
        });
        if (lastReadMsg) {
          unreadCount = await prisma.message.count({
            where: { channelId: rs.channelId, threadId: null, createdAt: { gt: lastReadMsg.createdAt } },
          });
        }
      }

      if (unreadCount > 0 || rs.mentionCount > 0) {
        unreads.push({
          channelId: rs.channelId,
          serverId: rs.channel.serverId,
          unreadCount,
          mentionCount: rs.mentionCount,
        });
      }
    }

    // DM channel unreads
    const dmParticipants = await prisma.dMParticipant.findMany({
      where: { userId },
      select: { channelId: true },
    });

    for (const dp of dmParticipants) {
      const readState = await prisma.dMChannelReadState.findUnique({
        where: { userId_channelId: { userId, channelId: dp.channelId } },
      });

      let unreadCount: number;
      if (readState?.lastReadMessageId) {
        const lastReadMsg = await prisma.dMMessage.findUnique({
          where: { id: readState.lastReadMessageId },
          select: { createdAt: true },
        });
        if (lastReadMsg) {
          unreadCount = await prisma.dMMessage.count({
            where: { channelId: dp.channelId, createdAt: { gt: lastReadMsg.createdAt } },
          });
        } else {
          unreadCount = await prisma.dMMessage.count({ where: { channelId: dp.channelId } });
        }
      } else {
        // No read state — skip (treat as read for first connect, until they get a new message)
        continue;
      }

      if (unreadCount > 0) {
        unreads.push({
          channelId: dp.channelId,
          serverId: null,
          unreadCount,
          mentionCount: 0,
        });
      }
    }

    // Thread unreads
    const threadReadStates = await prisma.threadReadState.findMany({
      where: { userId },
      include: { thread: { select: { id: true, channelId: true, channel: { select: { serverId: true } } } } },
    });

    for (const rs of threadReadStates) {
      let unreadCount = 0;
      if (rs.lastReadMessageId) {
        const lastReadMsg = await prisma.message.findUnique({
          where: { id: rs.lastReadMessageId },
          select: { createdAt: true },
        });
        if (lastReadMsg) {
          unreadCount = await prisma.message.count({
            where: { threadId: rs.threadId, createdAt: { gt: lastReadMsg.createdAt } },
          });
        }
      }

      if (unreadCount > 0 || rs.mentionCount > 0) {
        unreads.push({
          channelId: rs.threadId,
          serverId: rs.thread.channel.serverId,
          threadId: rs.threadId,
          unreadCount,
          mentionCount: rs.mentionCount,
        } as any);
      }
    }

    if (unreads.length > 0) {
      socket.emit('unread:initial', unreads);
    }
  } catch (err) {
    logger.error(err, 'Error emitting initial unreads');
  }
}
