import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { createSystemMessage } from '../lib/systemMessages.js';

const router = Router();

const createInviteSchema = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().positive().optional(),
});

function generateCode(): string {
  return crypto.randomBytes(8).toString('hex');
}

// Create invite for a server
router.post('/servers/:serverId/invites', authMiddleware, async (req, res) => {
  try {
    const body = createInviteSchema.parse(req.body ?? {});
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member' });
      return;
    }

    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : null;

    const invite = await prisma.invite.create({
      data: {
        code: generateCode(),
        serverId: req.params.serverId,
        creatorId: req.userId!,
        maxUses: body.maxUses ?? null,
        expiresAt,
      },
    });

    res.status(201).json({
      data: {
        id: invite.id,
        code: invite.code,
        serverId: invite.serverId,
        creatorId: invite.creatorId,
        maxUses: invite.maxUses,
        uses: invite.uses,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// List invites for a server (admin+)
router.get('/servers/:serverId/invites', authMiddleware, async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const invites = await prisma.invite.findMany({
    where: { serverId: req.params.serverId },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    data: invites.map((i) => ({
      id: i.id,
      code: i.code,
      serverId: i.serverId,
      creatorId: i.creatorId,
      maxUses: i.maxUses,
      uses: i.uses,
      expiresAt: i.expiresAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
  });
});

// Delete invite (admin+ or creator)
router.delete('/servers/:serverId/invites/:inviteId', authMiddleware, async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  const invite = await prisma.invite.findUnique({ where: { id: req.params.inviteId } });
  if (!invite || invite.serverId !== req.params.serverId) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  const isAdminOrOwner = member && ['owner', 'admin'].includes(member.role);
  const isCreator = invite.creatorId === req.userId;
  if (!isAdminOrOwner && !isCreator) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  await prisma.invite.delete({ where: { id: req.params.inviteId } });
  res.json({ data: { success: true } });
});

// Preview invite (public - no auth required for preview)
router.get('/invites/:code', async (req, res) => {
  const invite = await prisma.invite.findUnique({
    where: { code: req.params.code },
    include: {
      server: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invalid invite' });
    return;
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  if (invite.maxUses && invite.uses >= invite.maxUses) {
    res.status(410).json({ error: 'Invite has reached max uses' });
    return;
  }

  res.json({
    data: {
      code: invite.code,
      serverName: invite.server.name,
      memberCount: invite.server._count.members,
    },
  });
});

// Join via invite code
router.post('/invites/:code/join', authMiddleware, async (req, res) => {
  const invite = await prisma.invite.findUnique({
    where: { code: req.params.code },
    include: { server: true },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invalid invite' });
    return;
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  if (invite.maxUses && invite.uses >= invite.maxUses) {
    res.status(410).json({ error: 'Invite has reached max uses' });
    return;
  }

  // Check if already a member
  const existing = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: invite.serverId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Already a member' });
    return;
  }

  // Check if banned
  const ban = await prisma.serverBan.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: invite.serverId } },
  });
  if (ban) {
    res.status(403).json({ error: 'You are banned from this server' });
    return;
  }

  // Join and increment uses in a transaction
  const [member] = await prisma.$transaction([
    prisma.member.create({
      data: { userId: req.userId!, serverId: invite.serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        server: { include: { channels: true } },
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  // Broadcast member joined via socket
  const { io } = await import('../index.js');
  io.emit('member:joined', {
    id: member.id,
    role: member.role,
    userId: member.userId,
    serverId: member.serverId,
    user: member.user,
  });

  // Emit system join message to the first text channel
  const firstTextChannel = (member as any).server?.channels?.find((c: any) => c.type === 'text');
  if (firstTextChannel) {
    const sysMsg = await createSystemMessage(
      firstTextChannel.id,
      req.userId!,
      'system_join',
      `${member.user.displayName} joined the server`,
    );
    io.to(`channel:${firstTextChannel.id}`).emit('message:new', sysMsg);
  }

  res.status(201).json({
    data: {
      server: member.server,
      member: {
        id: member.id,
        role: member.role,
        userId: member.userId,
        serverId: member.serverId,
        user: member.user,
      },
    },
  });
});

export default router;
