import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { UPLOAD_DIR } from '../lib/upload.js';
import { createSystemMessage } from '../lib/systemMessages.js';
import { updateServerAfkCache } from '../socket/voiceHandler.js';

const router = Router();
router.use(authMiddleware);

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  afkChannelId: z.string().nullable().optional(),
  afkTimeout: z.number().int().min(60).max(86400).optional(),
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  permissions: z.string().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  permissions: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

// Update server settings
router.patch('/:serverId', async (req, res) => {
  try {
    const body = updateServerSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const server = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.afkChannelId !== undefined && { afkChannelId: body.afkChannelId }),
        ...(body.afkTimeout !== undefined && { afkTimeout: body.afkTimeout }),
      },
    });

    // Update AFK settings cache
    updateServerAfkCache(server.id, server.afkChannelId, server.afkTimeout);

    // Broadcast update
    const { io } = await import('../index.js');
    io.emit('server:updated', {
      id: server.id,
      name: server.name,
      iconUrl: server.iconUrl,
      description: server.description,
      ownerId: server.ownerId,
      afkChannelId: server.afkChannelId,
      afkTimeout: server.afkTimeout,
    });

    res.json({ data: server });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Upload server icon
const iconStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `icon-${crypto.randomUUID()}${ext}`);
  },
});

const ICON_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const iconUpload = multer({
  storage: iconStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (ICON_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed for icons`));
    }
  },
}).single('icon');

router.patch('/:serverId/icon', (req, res) => {
  iconUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No icon file provided' });
      return;
    }

    const iconUrl = `/uploads/${file.filename}`;
    const server = await prisma.server.update({
      where: { id: req.params.serverId },
      data: { iconUrl },
    });

    const { io } = await import('../index.js');
    io.emit('server:updated', {
      id: server.id,
      name: server.name,
      iconUrl: server.iconUrl,
      description: server.description,
      ownerId: server.ownerId,
      afkChannelId: server.afkChannelId,
      afkTimeout: server.afkTimeout,
    });

    res.json({ data: server });
  });
});

// Create role
router.post('/:serverId/roles', async (req, res) => {
  try {
    const body = createRoleSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const maxPos = await prisma.role.aggregate({
      where: { serverId: req.params.serverId },
      _max: { position: true },
    });

    const role = await prisma.role.create({
      data: {
        name: body.name,
        color: body.color ?? null,
        permissions: body.permissions ?? '0',
        position: (maxPos._max.position ?? -1) + 1,
        serverId: req.params.serverId,
      },
    });

    res.status(201).json({ data: role });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// List roles
router.get('/:serverId/roles', async (req, res) => {
  const roles = await prisma.role.findMany({
    where: { serverId: req.params.serverId },
    orderBy: { position: 'asc' },
  });
  res.json({ data: roles });
});

// Update role
router.patch('/:serverId/roles/:roleId', async (req, res) => {
  try {
    const body = updateRoleSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const existingRole = await prisma.role.findFirst({
      where: { id: req.params.roleId, serverId: req.params.serverId },
    });
    if (!existingRole) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const role = await prisma.role.update({
      where: { id: req.params.roleId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.permissions !== undefined && { permissions: body.permissions }),
        ...(body.position !== undefined && { position: body.position }),
      },
    });

    res.json({ data: role });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Delete role
router.delete('/:serverId/roles/:roleId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const role = await prisma.role.findFirst({
    where: { id: req.params.roleId, serverId: req.params.serverId },
  });
  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }

  await prisma.role.delete({ where: { id: req.params.roleId } });
  res.json({ data: { success: true } });
});

// Assign role to member
router.post('/:serverId/members/:memberId/roles/:roleId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const memberRole = await prisma.memberRole.create({
    data: { memberId: req.params.memberId, roleId: req.params.roleId },
  });
  res.status(201).json({ data: memberRole });
});

// Remove role from member
router.delete('/:serverId/members/:memberId/roles/:roleId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  await prisma.memberRole.deleteMany({
    where: { memberId: req.params.memberId, roleId: req.params.roleId },
  });
  res.json({ data: { success: true } });
});

// Kick member
router.delete('/:serverId/members/:memberId', async (req, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  const actor = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const target = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.params.memberId, serverId: req.params.serverId } },
  }) ?? await prisma.member.findUnique({ where: { id: req.params.memberId } });
  if (!target) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  // Can't kick owner
  if (target.userId === server.ownerId) {
    res.status(400).json({ error: 'Cannot kick the server owner' });
    return;
  }

  // Admins can't kick other admins (only owner can)
  if (target.role === 'admin' && actor.role !== 'owner') {
    res.status(403).json({ error: 'Only the owner can kick admins' });
    return;
  }

  // Get target user info before deleting
  const targetWithUser = await prisma.member.findUnique({
    where: { id: target.id },
    include: { user: { select: { displayName: true } } },
  });

  await prisma.member.delete({ where: { id: target.id } });

  const { io } = await import('../index.js');
  io.emit('member:left', { userId: target.userId, serverId: req.params.serverId });

  // Emit system leave message
  const firstTextChannel = await prisma.channel.findFirst({
    where: { serverId: req.params.serverId, type: 'text' },
    orderBy: { position: 'asc' },
  });
  if (firstTextChannel && targetWithUser) {
    const sysMsg = await createSystemMessage(
      firstTextChannel.id,
      target.userId,
      'system_leave',
      `${targetWithUser.user.displayName} was kicked from the server`,
    );
    io.to(`channel:${firstTextChannel.id}`).emit('message:new', sysMsg);
  }

  res.json({ data: { success: true } });
});

// ── Ban System ──

// Ban a user
router.post('/:serverId/bans/:userId', async (req, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  const actor = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  // Can't ban the owner
  if (req.params.userId === server.ownerId) {
    res.status(400).json({ error: 'Cannot ban the server owner' });
    return;
  }

  // Can't ban yourself
  if (req.params.userId === req.userId) {
    res.status(400).json({ error: 'Cannot ban yourself' });
    return;
  }

  // Admins can't ban other admins
  const targetMember = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
    include: { user: { select: { displayName: true } } },
  });
  if (targetMember?.role === 'admin' && actor.role !== 'owner') {
    res.status(403).json({ error: 'Only the owner can ban admins' });
    return;
  }

  const reason = (req.body as any)?.reason || null;

  // Create ban
  await prisma.serverBan.upsert({
    where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
    create: {
      userId: req.params.userId,
      serverId: req.params.serverId,
      reason,
      bannedById: req.userId!,
    },
    update: { reason, bannedById: req.userId! },
  });

  // Remove member if they exist
  if (targetMember) {
    await prisma.member.delete({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
    });
  }

  const { io } = await import('../index.js');
  io.emit('member:left', { userId: req.params.userId, serverId: req.params.serverId });
  io.emit('member:banned', { userId: req.params.userId, serverId: req.params.serverId });

  // Emit system leave message
  const firstTextChannel = await prisma.channel.findFirst({
    where: { serverId: req.params.serverId, type: 'text' },
    orderBy: { position: 'asc' },
  });
  if (firstTextChannel && targetMember) {
    const sysMsg = await createSystemMessage(
      firstTextChannel.id,
      req.params.userId,
      'system_leave',
      `${targetMember.user.displayName} was banned from the server`,
    );
    io.to(`channel:${firstTextChannel.id}`).emit('message:new', sysMsg);
  }

  res.json({ data: { success: true } });
});

// Unban a user
router.delete('/:serverId/bans/:userId', async (req, res) => {
  const actor = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  try {
    await prisma.serverBan.delete({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
    });
    res.json({ data: { success: true } });
  } catch {
    res.status(404).json({ error: 'Ban not found' });
  }
});

// List bans
router.get('/:serverId/bans', async (req, res) => {
  const actor = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const bans = await prisma.serverBan.findMany({
    where: { serverId: req.params.serverId },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch user info for each ban
  const userIds = bans.map((b) => b.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  res.json({
    data: bans.map((b) => ({
      id: b.id,
      userId: b.userId,
      serverId: b.serverId,
      reason: b.reason,
      bannedById: b.bannedById,
      createdAt: b.createdAt.toISOString(),
      user: userMap.get(b.userId) || null,
    })),
  });
});

export default router;
