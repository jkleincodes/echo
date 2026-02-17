import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { createSystemMessage } from '../lib/systemMessages.js';

const router = Router();
router.use(authMiddleware);

const createServerSchema = z.object({
  name: z.string().min(1).max(100),
});

// List servers the user is a member of
router.get('/', async (req, res) => {
  const members = await prisma.member.findMany({
    where: { userId: req.userId! },
    include: { server: true },
  });
  res.json({ data: members.map((m) => m.server) });
});

// Create a server
router.post('/', async (req, res) => {
  try {
    const body = createServerSchema.parse(req.body);
    const server = await prisma.server.create({
      data: {
        name: body.name,
        ownerId: req.userId!,
        members: {
          create: { userId: req.userId!, role: 'owner' },
        },
        channels: {
          createMany: {
            data: [
              { name: 'general', type: 'text', position: 0 },
              { name: 'General', type: 'voice', position: 1 },
            ],
          },
        },
      },
      include: { channels: true },
    });
    res.status(201).json({ data: server });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Get server details (with channels and members)
router.get('/:serverId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const server = await prisma.server.findUnique({
    where: { id: req.params.serverId },
    include: {
      channels: { orderBy: { position: 'asc' } },
      categories: { orderBy: { position: 'asc' } },
      members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } }, memberRoles: { include: { role: true } } } },
      roles: { orderBy: { position: 'asc' } },
    },
  });
  res.json({ data: server });
});

// Join a server by invite (simple: just serverId for now)
router.post('/:serverId/join', async (req, res) => {
  const existing = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Already a member' });
    return;
  }

  const server = await prisma.server.findUnique({
    where: { id: req.params.serverId },
    include: { channels: { where: { type: 'text' }, orderBy: { position: 'asc' }, take: 1 } },
  });
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  // Check if banned
  const ban = await prisma.serverBan.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (ban) {
    res.status(403).json({ error: 'You are banned from this server' });
    return;
  }

  const member = await prisma.member.create({
    data: { userId: req.userId!, serverId: req.params.serverId },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } } },
  });

  // Emit system join message
  if (server.channels[0]) {
    const { io } = await import('../index.js');
    const sysMsg = await createSystemMessage(
      server.channels[0].id,
      req.userId!,
      'system_join',
      `${member.user.displayName} joined the server`,
    );
    io.to(`channel:${server.channels[0].id}`).emit('message:new', sysMsg);
  }

  res.status(201).json({ data: member });
});

// Leave a server
router.delete('/:serverId/leave', async (req, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }
  if (server.ownerId === req.userId) {
    res.status(400).json({ error: 'Owner cannot leave. Delete the server instead.' });
    return;
  }

  await prisma.member.delete({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  res.json({ data: { success: true } });
});

export default router;
