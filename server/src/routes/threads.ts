import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { THREAD_MESSAGE_INCLUDE, serializeMessage, serializeThread } from '../lib/serializers.js';
import { upload, validateUploadedFiles } from '../lib/upload.js';

const router = Router();
router.use(authMiddleware);

const createThreadSchema = z.object({
  messageId: z.string().min(1),
  name: z.string().min(1).max(100),
});

const updateThreadSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  archived: z.boolean().optional(),
});

const THREAD_INCLUDE = {
  creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  participants: {
    include: { user: { select: { id: true, avatarUrl: true } } },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: THREAD_MESSAGE_INCLUDE,
  },
};

// Create thread from a message
router.post('/:serverId/channels/:channelId/threads', async (req, res) => {
  try {
    const body = createThreadSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member' });
      return;
    }

    // Verify message exists and belongs to this channel
    const message = await prisma.message.findFirst({
      where: { id: body.messageId, channelId: req.params.channelId },
    });
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (message.type !== 'default') {
      res.status(400).json({ error: 'Cannot create a thread from a system message' });
      return;
    }

    // Check if thread already exists for this message
    const existing = await prisma.thread.findUnique({
      where: { starterMessageId: body.messageId },
    });
    if (existing) {
      res.status(409).json({ error: 'Thread already exists for this message' });
      return;
    }

    const thread = await prisma.$transaction(async (tx) => {
      const t = await tx.thread.create({
        data: {
          name: body.name,
          channelId: req.params.channelId,
          starterMessageId: body.messageId,
          creatorId: req.userId!,
          participants: {
            create: [{ userId: req.userId! }],
          },
        },
        include: THREAD_INCLUDE,
      });

      // Post a system message in the parent channel
      await tx.message.create({
        data: {
          content: `${member.role === 'owner' ? 'Owner' : ''} started a thread: **${body.name}**`,
          type: 'system_thread',
          channelId: req.params.channelId,
          authorId: req.userId!,
        },
      });

      return t;
    });

    const payload = serializeThread(thread as any);

    // Broadcast thread creation
    const { io } = await import('../index.js');
    io.to(`channel:${req.params.channelId}`).emit('thread:created', payload);

    // Also emit an updated starter message so the thread indicator appears
    const updatedMessage = await prisma.message.findUnique({
      where: { id: body.messageId },
      include: {
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
      },
    });
    if (updatedMessage) {
      io.to(`channel:${req.params.channelId}`).emit('message:edited', serializeMessage(updatedMessage as any));
    }

    res.status(201).json({ data: payload });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// List active threads in a channel
router.get('/:serverId/channels/:channelId/threads', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const threads = await prisma.thread.findMany({
    where: { channelId: req.params.channelId, archived: false },
    orderBy: { lastActivityAt: 'desc' },
    include: THREAD_INCLUDE,
  });

  res.json({ data: threads.map((t) => serializeThread(t as any)) });
});

// Get thread details
router.get('/:serverId/threads/:threadId', async (req, res) => {
  const thread = await prisma.thread.findUnique({
    where: { id: req.params.threadId },
    include: {
      ...THREAD_INCLUDE,
      channel: { select: { serverId: true } },
    },
  });
  if (!thread || thread.channel.serverId !== req.params.serverId) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  res.json({ data: serializeThread(thread as any) });
});

// Get thread messages (cursor-based pagination)
router.get('/:serverId/threads/:threadId/messages', async (req, res) => {
  const thread = await prisma.thread.findUnique({
    where: { id: req.params.threadId },
    include: { channel: { select: { serverId: true } } },
  });
  if (!thread || thread.channel.serverId !== req.params.serverId) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const limit = 50;
  const cursor = req.query.cursor as string | undefined;

  const messages = await prisma.message.findMany({
    where: { threadId: req.params.threadId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: THREAD_MESSAGE_INCLUDE,
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  res.json({
    data: messages.map((m) => serializeMessage(m as any)),
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  });
});

// Send message with attachments in thread (REST for file uploads)
router.post('/:serverId/threads/:threadId/messages', (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const thread = await prisma.thread.findUnique({
        where: { id: req.params.threadId },
        include: { channel: { select: { serverId: true } } },
      });
      if (!thread || thread.channel.serverId !== req.params.serverId) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      const member = await prisma.member.findUnique({
        where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
      });
      if (!member) {
        res.status(403).json({ error: 'Not a member' });
        return;
      }

      const content = (req.body.content as string || '').trim();
      const replyToId = req.body.replyToId as string | undefined;
      const files = (req.files as Express.Multer.File[]) || [];

      if (!content && files.length === 0) {
        res.status(400).json({ error: 'Message must have content or files' });
        return;
      }

      if (files.length > 0) {
        const validationError = await validateUploadedFiles(files);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }
      }

      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            content: content || '',
            channelId: thread.channelId,
            authorId: req.userId!,
            threadId: req.params.threadId,
            replyToId: replyToId || null,
            attachments: {
              create: files.map((f) => ({
                filename: f.originalname,
                storedAs: f.filename,
                mimeType: f.mimetype,
                size: f.size,
              })),
            },
          },
          include: THREAD_MESSAGE_INCLUDE,
        }),
        prisma.thread.update({
          where: { id: req.params.threadId },
          data: {
            lastActivityAt: new Date(),
            messageCount: { increment: 1 },
          },
        }),
        // Auto-add sender as participant
        prisma.threadParticipant.upsert({
          where: { threadId_userId: { threadId: req.params.threadId, userId: req.userId! } },
          create: { threadId: req.params.threadId, userId: req.userId! },
          update: {},
        }),
      ]);

      const payload = serializeMessage(message as any);

      const { io } = await import('../index.js');
      io.to(`thread:${req.params.threadId}`).emit('thread:message:new', payload);

      // Notify parent channel about thread update
      io.to(`channel:${thread.channelId}`).emit('thread:updated', {
        threadId: req.params.threadId,
        channelId: thread.channelId,
        messageCount: thread.messageCount + 1,
        lastActivityAt: new Date().toISOString(),
        starterMessageId: thread.starterMessageId,
      });

      res.status(201).json({ data: payload });
    } catch (error) {
      next(error);
    }
  });
});

// Mark thread as read
router.post('/:serverId/threads/:threadId/ack', async (req, res) => {
  const { messageId } = req.body as { messageId?: string };

  await prisma.threadReadState.upsert({
    where: { userId_threadId: { userId: req.userId!, threadId: req.params.threadId } },
    create: {
      userId: req.userId!,
      threadId: req.params.threadId,
      lastReadMessageId: messageId || null,
      mentionCount: 0,
    },
    update: {
      lastReadMessageId: messageId || null,
      mentionCount: 0,
    },
  });

  try {
    const { io } = await import('../index.js');
    const { getSocketIdsForUser } = await import('../socket/presenceHandler.js');
    const socketIds = getSocketIdsForUser(req.userId!);
    for (const sid of socketIds) {
      io.to(sid).emit('unread:update', {
        channelId: req.params.threadId,
        serverId: req.params.serverId,
        threadId: req.params.threadId,
        unreadCount: 0,
        mentionCount: 0,
      });
    }
  } catch {}

  res.json({ data: { success: true } });
});

// Update thread (name/archived)
router.patch('/:serverId/threads/:threadId', async (req, res) => {
  try {
    const body = updateThreadSchema.parse(req.body);
    const thread = await prisma.thread.findUnique({
      where: { id: req.params.threadId },
      include: { channel: { select: { serverId: true } } },
    });
    if (!thread || thread.channel.serverId !== req.params.serverId) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member' });
      return;
    }

    // Only thread creator or admins/owners can update
    if (thread.creatorId !== req.userId! && !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const updated = await prisma.thread.update({
      where: { id: req.params.threadId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.archived !== undefined && { archived: body.archived }),
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, avatarUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: THREAD_MESSAGE_INCLUDE,
        },
      },
    });

    const payload = serializeThread(updated as any);

    const { io } = await import('../index.js');
    io.to(`channel:${thread.channelId}`).emit('thread:updated', {
      threadId: thread.id,
      channelId: thread.channelId,
      messageCount: updated.messageCount,
      lastActivityAt: updated.lastActivityAt.toISOString(),
      starterMessageId: updated.starterMessageId,
      name: updated.name,
      archived: updated.archived,
    });

    res.json({ data: payload });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Join (follow) thread
router.post('/:serverId/threads/:threadId/join', async (req, res) => {
  const thread = await prisma.thread.findUnique({
    where: { id: req.params.threadId },
    include: { channel: { select: { serverId: true } } },
  });
  if (!thread || thread.channel.serverId !== req.params.serverId) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  await prisma.threadParticipant.upsert({
    where: { threadId_userId: { threadId: req.params.threadId, userId: req.userId! } },
    create: { threadId: req.params.threadId, userId: req.userId! },
    update: {},
  });

  res.json({ data: { success: true } });
});

// Leave (unfollow) thread
router.delete('/:serverId/threads/:threadId/join', async (req, res) => {
  await prisma.threadParticipant.deleteMany({
    where: { threadId: req.params.threadId, userId: req.userId! },
  });

  res.json({ data: { success: true } });
});

export default router;
