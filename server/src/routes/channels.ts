import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { MESSAGE_INCLUDE, serializeMessage } from '../lib/serializers.js';
import { upload, validateUploadedFiles } from '../lib/upload.js';

const router = Router();
router.use(authMiddleware);

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['text', 'voice']),
  categoryId: z.string().optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
});

// Create channel in a server
router.post('/:serverId/channels', async (req, res) => {
  try {
    const body = createChannelSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const maxPos = await prisma.channel.aggregate({
      where: { serverId: req.params.serverId },
      _max: { position: true },
    });

    const channel = await prisma.channel.create({
      data: {
        name: body.name,
        type: body.type,
        position: (maxPos._max.position ?? -1) + 1,
        serverId: req.params.serverId,
        categoryId: body.categoryId || null,
      },
    });
    res.status(201).json({ data: channel });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Reorder channels (bulk update positions and categories)
const reorderChannelsSchema = z.object({
  channels: z.array(z.object({
    id: z.string(),
    position: z.number().int().min(0),
    categoryId: z.string().nullable(),
  })),
});

router.patch('/:serverId/channels/reorder', async (req, res) => {
  try {
    const body = reorderChannelsSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Validate all channel IDs belong to this server
    const channelIds = body.channels.map((c) => c.id);
    const existingChannels = await prisma.channel.findMany({
      where: { id: { in: channelIds }, serverId: req.params.serverId },
      select: { id: true },
    });
    if (existingChannels.length !== channelIds.length) {
      res.status(400).json({ error: 'One or more channels do not belong to this server' });
      return;
    }

    // Validate all non-null categoryIds belong to this server
    const categoryIds = [...new Set(body.channels.map((c) => c.categoryId).filter(Boolean))] as string[];
    if (categoryIds.length > 0) {
      const existingCategories = await prisma.channelCategory.findMany({
        where: { id: { in: categoryIds }, serverId: req.params.serverId },
        select: { id: true },
      });
      if (existingCategories.length !== categoryIds.length) {
        res.status(400).json({ error: 'One or more categories do not belong to this server' });
        return;
      }
    }

    // Batch update all channels in a transaction
    const updates = body.channels.map((c) =>
      prisma.channel.update({
        where: { id: c.id },
        data: { position: c.position, categoryId: c.categoryId },
      })
    );
    const updatedChannels = await prisma.$transaction(updates);

    // Broadcast to server room
    const { io } = await import('../index.js');
    io.emit('channels:reordered', {
      serverId: req.params.serverId,
      channels: updatedChannels,
    });

    res.json({ data: updatedChannels });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Update channel (name and/or topic)
const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).optional().nullable(),
});

router.patch('/:serverId/channels/:channelId', async (req, res) => {
  try {
    const body = updateChannelSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const channel = await prisma.channel.findFirst({
      where: { id: req.params.channelId, serverId: req.params.serverId },
    });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const updatedChannel = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.topic !== undefined && { topic: body.topic }),
      },
    });

    // Broadcast channel update
    const { io } = await import('../index.js');
    io.emit('channel:updated', updatedChannel);

    res.json({ data: updatedChannel });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Delete channel
router.delete('/:serverId/channels/:channelId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const channel = await prisma.channel.findFirst({
    where: { id: req.params.channelId, serverId: req.params.serverId },
  });
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  await prisma.channel.delete({ where: { id: req.params.channelId } });

  // Broadcast channel deletion
  const { io } = await import('../index.js');
  io.emit('channel:deleted', { channelId: req.params.channelId, serverId: req.params.serverId });

  res.json({ data: { success: true } });
});

// ── Categories ──

// Create category
router.post('/:serverId/categories', async (req, res) => {
  try {
    const body = createCategorySchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const maxPos = await prisma.channelCategory.aggregate({
      where: { serverId: req.params.serverId },
      _max: { position: true },
    });

    const category = await prisma.channelCategory.create({
      data: {
        name: body.name,
        position: (maxPos._max.position ?? -1) + 1,
        serverId: req.params.serverId,
      },
    });
    res.status(201).json({ data: category });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Update category
router.patch('/:serverId/categories/:categoryId', async (req, res) => {
  try {
    const body = updateCategorySchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const existing = await prisma.channelCategory.findFirst({
      where: { id: req.params.categoryId, serverId: req.params.serverId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    const category = await prisma.channelCategory.update({
      where: { id: req.params.categoryId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.position !== undefined && { position: body.position }),
      },
    });
    res.json({ data: category });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Delete category (channels become uncategorized)
router.delete('/:serverId/categories/:categoryId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const cat = await prisma.channelCategory.findFirst({
    where: { id: req.params.categoryId, serverId: req.params.serverId },
  });
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  // Set channels to uncategorized first
  await prisma.channel.updateMany({
    where: { categoryId: req.params.categoryId },
    data: { categoryId: null },
  });

  await prisma.channelCategory.delete({ where: { id: req.params.categoryId } });
  res.json({ data: { success: true } });
});

// ── Pinned Messages ──

// Pin a message
router.post('/:serverId/channels/:channelId/pins/:messageId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const message = await prisma.message.update({
    where: { id: req.params.messageId },
    data: { pinnedAt: new Date(), pinnedById: req.userId! },
    include: MESSAGE_INCLUDE,
  });

  const payload = serializeMessage(message);

  // Broadcast pin event
  const { io } = await import('../index.js');
  io.to(`channel:${req.params.channelId}`).emit('message:pinned', payload);

  res.json({ data: payload });
});

// Unpin a message
router.delete('/:serverId/channels/:channelId/pins/:messageId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  await prisma.message.update({
    where: { id: req.params.messageId },
    data: { pinnedAt: null, pinnedById: null },
  });

  const { io } = await import('../index.js');
  io.to(`channel:${req.params.channelId}`).emit('message:unpinned', {
    messageId: req.params.messageId,
    channelId: req.params.channelId,
  });

  res.json({ data: { success: true } });
});

// List pinned messages
router.get('/:serverId/channels/:channelId/pins', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const messages = await prisma.message.findMany({
    where: { channelId: req.params.channelId, pinnedAt: { not: null } },
    orderBy: { pinnedAt: 'desc' },
    include: MESSAGE_INCLUDE,
  });

  res.json({ data: messages.map(serializeMessage) });
});

// ── Acknowledge / Read State ──

router.post('/:serverId/channels/:channelId/ack', async (req, res) => {
  const { messageId } = req.body as { messageId?: string };

  await prisma.channelReadState.upsert({
    where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } },
    create: {
      userId: req.userId!,
      channelId: req.params.channelId,
      lastReadMessageId: messageId || null,
      mentionCount: 0,
    },
    update: {
      lastReadMessageId: messageId || null,
      mentionCount: 0,
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
        serverId: req.params.serverId,
        unreadCount: 0,
        mentionCount: 0,
      });
    }
  } catch {}

  res.json({ data: { success: true } });
});

// ── Messages ──

// Send message with attachments (REST endpoint for file uploads)
router.post('/:serverId/channels/:channelId/messages', (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
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

      // Validate actual file content matches allowed MIME types
      if (files.length > 0) {
        const validationError = await validateUploadedFiles(files);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }
      }

      const message = await prisma.message.create({
        data: {
          content: content || '',
          channelId: req.params.channelId,
          authorId: req.userId!,
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
        include: MESSAGE_INCLUDE,
      });

      const payload = serializeMessage(message);

      // Broadcast via socket
      const { io } = await import('../index.js');
      io.to(`channel:${req.params.channelId}`).emit('message:new', payload);

      res.status(201).json({ data: payload });
    } catch (error) {
      next(error);
    }
  });
});

// Get messages for a channel (cursor-based pagination)
router.get('/:serverId/channels/:channelId/messages', async (req, res) => {
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
    where: { channelId: req.params.channelId, threadId: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: MESSAGE_INCLUDE,
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  res.json({
    data: messages.map(serializeMessage),
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  });
});

export default router;
