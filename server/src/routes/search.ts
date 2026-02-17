import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { MESSAGE_INCLUDE, serializeMessage } from '../lib/serializers.js';

const router = Router();
router.use(authMiddleware);

// Search messages in a server
router.get('/servers/:serverId/search', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const q = (req.query.q as string || '').trim();
  if (!q) {
    res.json({ data: [], nextCursor: null });
    return;
  }

  const channelId = req.query.channelId as string | undefined;
  const authorId = req.query.authorId as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string || '25', 10), 50);
  const cursor = req.query.cursor as string | undefined;

  // Get server channels to filter
  const serverChannels = await prisma.channel.findMany({
    where: { serverId: req.params.serverId, type: 'text' },
    select: { id: true },
  });
  const channelIds = channelId
    ? [channelId]
    : serverChannels.map((c) => c.id);

  const messages = await prisma.message.findMany({
    where: {
      channelId: { in: channelIds },
      content: { contains: q },
      ...(authorId ? { authorId } : {}),
    },
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
