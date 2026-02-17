import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSocketIdsForUser } from '../socket/presenceHandler.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(authMiddleware);

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, status: true };

function serializeFriendship(f: any) {
  return {
    id: f.id,
    status: f.status,
    senderId: f.senderId,
    receiverId: f.receiverId,
    createdAt: f.createdAt.toISOString(),
    sender: f.sender,
    receiver: f.receiver,
  };
}

// List friends (accepted)
router.get('/', async (req, res) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: req.userId! }, { receiverId: req.userId! }],
    },
    include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: friendships.map(serializeFriendship) });
});

// List pending friend requests
router.get('/pending', async (req, res) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'pending',
      OR: [{ senderId: req.userId! }, { receiverId: req.userId! }],
    },
    include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: friendships.map(serializeFriendship) });
});

// Send friend request
router.post('/request', async (req, res) => {
  try {
    const { username } = z.object({ username: z.string() }).parse(req.body);

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.id === req.userId) {
      res.status(400).json({ error: "You can't send a friend request to yourself" });
      return;
    }

    // Check existing friendship in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: req.userId!, receiverId: target.id },
          { senderId: target.id, receiverId: req.userId! },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        res.status(409).json({ error: 'Already friends' });
        return;
      }
      if (existing.status === 'pending') {
        // If they sent us a request, auto-accept
        if (existing.senderId === target.id) {
          const updated = await prisma.friendship.update({
            where: { id: existing.id },
            data: { status: 'accepted' },
            include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
          });
          const payload = serializeFriendship(updated);
          emitToUser(target.id, 'friend:request-accepted', payload);
          res.json({ data: payload });
          return;
        }
        res.status(409).json({ error: 'Request already pending' });
        return;
      }
      if (existing.status === 'blocked') {
        res.status(403).json({ error: 'Unable to send request' });
        return;
      }
    }

    const friendship = await prisma.friendship.create({
      data: { senderId: req.userId!, receiverId: target.id },
      include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
    });

    const payload = serializeFriendship(friendship);
    emitToUser(target.id, 'friend:request-received', payload);
    res.status(201).json({ data: payload });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Accept friend request
router.post('/:id/accept', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: req.params.id },
  });

  if (!friendship || friendship.receiverId !== req.userId || friendship.status !== 'pending') {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  const updated = await prisma.friendship.update({
    where: { id: req.params.id },
    data: { status: 'accepted' },
    include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
  });

  const payload = serializeFriendship(updated);
  emitToUser(friendship.senderId, 'friend:request-accepted', payload);
  res.json({ data: payload });
});

// Decline friend request
router.post('/:id/decline', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: req.params.id },
  });

  if (!friendship || friendship.receiverId !== req.userId || friendship.status !== 'pending') {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  await prisma.friendship.delete({ where: { id: req.params.id } });
  res.json({ data: { success: true } });
});

// Remove friend / cancel request
router.delete('/:id', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: req.params.id },
  });

  if (!friendship) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (friendship.senderId !== req.userId && friendship.receiverId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await prisma.friendship.delete({ where: { id: req.params.id } });

  const otherId = friendship.senderId === req.userId ? friendship.receiverId : friendship.senderId;
  emitToUser(otherId, 'friend:removed', { friendshipId: req.params.id, userId: req.userId });

  res.json({ data: { success: true } });
});

async function emitToUser(userId: string, event: string, data: any) {
  try {
    const { io } = await import('../index.js');
    const socketIds = getSocketIdsForUser(userId);
    for (const sid of socketIds) {
      io.to(sid).emit(event, data);
    }
  } catch (err) {
    logger.error(err, 'Error emitting to user');
  }
}

export default router;
