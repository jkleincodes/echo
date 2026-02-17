import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, status: true };

// List DM channels
router.get('/', async (req, res) => {
  const participants = await prisma.dMParticipant.findMany({
    where: { userId: req.userId! },
    select: { channelId: true },
  });

  const channelIds = participants.map((p) => p.channelId);

  const channels = await prisma.dMChannel.findMany({
    where: { id: { in: channelIds } },
    include: {
      participants: { include: { user: { select: USER_SELECT } } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { author: { select: USER_SELECT } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    data: channels.map((ch) => ({
      id: ch.id,
      createdAt: ch.createdAt.toISOString(),
      participants: ch.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        channelId: p.channelId,
        user: p.user,
      })),
      lastMessage: ch.messages[0]
        ? {
            id: ch.messages[0].id,
            content: ch.messages[0].content,
            channelId: ch.messages[0].channelId,
            authorId: ch.messages[0].authorId,
            createdAt: ch.messages[0].createdAt.toISOString(),
            editedAt: ch.messages[0].editedAt?.toISOString() ?? null,
            author: ch.messages[0].author,
          }
        : null,
    })),
  });
});

// Create or get DM channel
router.post('/', async (req, res) => {
  try {
    const { userId: targetId } = z.object({ userId: z.string() }).parse(req.body);

    if (targetId === req.userId) {
      res.status(400).json({ error: 'Cannot DM yourself' });
      return;
    }

    // Check if DM channel already exists between these two users
    const existing = await prisma.dMChannel.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: req.userId! } } },
          { participants: { some: { userId: targetId } } },
        ],
      },
      include: {
        participants: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { author: { select: USER_SELECT } },
        },
      },
    });

    if (existing) {
      res.json({
        data: {
          id: existing.id,
          createdAt: existing.createdAt.toISOString(),
          participants: existing.participants.map((p) => ({
            id: p.id, userId: p.userId, channelId: p.channelId, user: p.user,
          })),
          lastMessage: existing.messages[0]
            ? {
                id: existing.messages[0].id,
                content: existing.messages[0].content,
                channelId: existing.messages[0].channelId,
                authorId: existing.messages[0].authorId,
                createdAt: existing.messages[0].createdAt.toISOString(),
                editedAt: existing.messages[0].editedAt?.toISOString() ?? null,
                author: existing.messages[0].author,
              }
            : null,
        },
      });
      return;
    }

    // Create new DM channel
    const channel = await prisma.dMChannel.create({
      data: {
        participants: {
          create: [{ userId: req.userId! }, { userId: targetId }],
        },
      },
      include: {
        participants: { include: { user: { select: USER_SELECT } } },
      },
    });

    const payload = {
      id: channel.id,
      createdAt: channel.createdAt.toISOString(),
      participants: channel.participants.map((p) => ({
        id: p.id, userId: p.userId, channelId: p.channelId, user: p.user,
      })),
      lastMessage: null,
    };

    // Notify target user via socket
    try {
      const { io } = await import('../index.js');
      const { getSocketIdsForUser } = await import('../socket/presenceHandler.js');
      const targetSocketIds = getSocketIdsForUser(targetId);
      for (const sid of targetSocketIds) {
        io.to(sid).emit('dm:new', { channel: payload });
        // Auto-join the socket to the DM room
        const socket = io.sockets.sockets.get(sid);
        socket?.join(`dm:${channel.id}`);
      }
      const mySocketIds = getSocketIdsForUser(req.userId!);
      for (const sid of mySocketIds) {
        const socket = io.sockets.sockets.get(sid);
        socket?.join(`dm:${channel.id}`);
      }
    } catch {}

    res.status(201).json({ data: payload });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Acknowledge / mark DM as read
router.post('/:channelId/ack', async (req, res) => {
  const participant = await prisma.dMParticipant.findUnique({
    where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } },
  });
  if (!participant) {
    res.status(403).json({ error: 'Not a participant' });
    return;
  }

  const { messageId } = req.body as { messageId?: string };

  await prisma.dMChannelReadState.upsert({
    where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } },
    create: {
      userId: req.userId!,
      channelId: req.params.channelId,
      lastReadMessageId: messageId || null,
    },
    update: {
      lastReadMessageId: messageId || null,
    },
  });

  // Emit unread:update to the user's sockets to clear unreads
  try {
    const { io } = await import('../index.js');
    const { getSocketIdsForUser } = await import('../socket/presenceHandler.js');
    const socketIds = getSocketIdsForUser(req.userId!);
    for (const sid of socketIds) {
      io.to(sid).emit('unread:update', {
        channelId: req.params.channelId,
        serverId: null,
        unreadCount: 0,
        mentionCount: 0,
      });
    }
  } catch {}

  res.json({ data: { success: true } });
});

// Get DM messages (cursor-based)
router.get('/:channelId/messages', async (req, res) => {
  const participant = await prisma.dMParticipant.findUnique({
    where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } },
  });
  if (!participant) {
    res.status(403).json({ error: 'Not a participant' });
    return;
  }

  const limit = 50;
  const cursor = req.query.cursor as string | undefined;

  const messages = await prisma.dMMessage.findMany({
    where: { channelId: req.params.channelId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { author: { select: USER_SELECT } },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  res.json({
    data: messages.map((m) => ({
      id: m.id,
      content: m.content,
      channelId: m.channelId,
      authorId: m.authorId,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      author: m.author,
    })),
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  });
});

export default router;
