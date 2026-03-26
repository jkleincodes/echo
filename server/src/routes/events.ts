import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Server } from 'socket.io';

const router = Router();
router.use(authMiddleware);

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  channelId: z.string().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  channelId: z.string().optional(),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled']).optional(),
});

const rsvpSchema = z.object({
  status: z.enum(['interested', 'going', 'not_going']),
});

/** Helper: get RSVP counts for an event, grouped by status */
async function getRsvpCounts(eventId: string) {
  const rsvps = await prisma.eventRSVP.findMany({
    where: { eventId },
    select: { status: true },
  });
  const counts: Record<string, number> = { interested: 0, going: 0, not_going: 0 };
  for (const r of rsvps) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return counts;
}

/** Helper: fetch a full event with creator info, RSVP counts, and user's RSVP */
async function getFullEvent(eventId: string, userId: string) {
  const event = await prisma.scheduledEvent.findUnique({
    where: { id: eventId },
    include: {
      channel: { select: { id: true, name: true } },
    },
  });
  if (!event) return null;

  const creator = await prisma.user.findUnique({
    where: { id: event.creatorId },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  const rsvpCounts = await getRsvpCounts(eventId);

  const userRsvp = await prisma.eventRSVP.findUnique({
    where: { userId_eventId: { userId, eventId } },
  });

  return {
    ...event,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    creator,
    rsvpCounts,
    userRsvp: userRsvp?.status ?? null,
  };
}

// List events for a server
router.get('/:serverId/events', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const statusParam = typeof req.query.status === 'string' ? req.query.status : 'scheduled,active';
  const statuses = statusParam.split(',').map((s) => s.trim());

  const now = new Date();

  // Lazy status transitions
  await prisma.scheduledEvent.updateMany({
    where: { serverId: req.params.serverId, status: 'scheduled', startAt: { lte: now } },
    data: { status: 'active' },
  });
  await prisma.scheduledEvent.updateMany({
    where: { serverId: req.params.serverId, status: 'active', endAt: { lte: now } },
    data: { status: 'completed' },
  });

  const events = await prisma.scheduledEvent.findMany({
    where: { serverId: req.params.serverId, status: { in: statuses } },
    orderBy: { startAt: 'asc' },
    include: {
      channel: { select: { id: true, name: true } },
    },
  });

  // Batch fetch creator info
  const creatorIds = [...new Set(events.map((e) => e.creatorId))];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });
  const creatorMap = new Map(creators.map((u) => [u.id, u]));

  // Batch fetch user RSVPs
  const eventIds = events.map((e) => e.id);
  const userRsvps = await prisma.eventRSVP.findMany({
    where: { userId: req.userId!, eventId: { in: eventIds } },
  });
  const userRsvpMap = new Map(userRsvps.map((r) => [r.eventId, r.status]));

  // Batch fetch all RSVPs for counts
  const allRsvps = await prisma.eventRSVP.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, status: true },
  });
  const rsvpCountMap = new Map<string, Record<string, number>>();
  for (const r of allRsvps) {
    if (!rsvpCountMap.has(r.eventId)) {
      rsvpCountMap.set(r.eventId, { interested: 0, going: 0, not_going: 0 });
    }
    const counts = rsvpCountMap.get(r.eventId)!;
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  const data = events.map((e) => ({
    ...e,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    creator: creatorMap.get(e.creatorId) ?? null,
    rsvpCounts: rsvpCountMap.get(e.id) ?? { interested: 0, going: 0, not_going: 0 },
    userRsvp: userRsvpMap.get(e.id) ?? null,
  }));

  res.json({ data });
});

// Create event
router.post('/:serverId/events', async (req, res) => {
  try {
    const body = createEventSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const event = await prisma.scheduledEvent.create({
      data: {
        title: body.title,
        description: body.description,
        startAt: new Date(body.startAt),
        endAt: body.endAt ? new Date(body.endAt) : undefined,
        location: body.location,
        channelId: body.channelId,
        creatorId: req.userId!,
        serverId: req.params.serverId,
      },
    });

    const fullEvent = await getFullEvent(event.id, req.userId!);

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.emit('event:created', fullEvent);
    }

    res.status(201).json({ data: fullEvent });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Update event
router.patch('/:serverId/events/:eventId', async (req, res) => {
  try {
    const body = updateEventSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });

    const event = await prisma.scheduledEvent.findFirst({
      where: { id: req.params.eventId, serverId: req.params.serverId },
    });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Require admin/owner or creator
    const isAdminOrOwner = member && ['owner', 'admin'].includes(member.role);
    const isCreator = event.creatorId === req.userId;
    if (!isAdminOrOwner && !isCreator) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    await prisma.scheduledEvent.update({
      where: { id: req.params.eventId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.startAt !== undefined && { startAt: new Date(body.startAt) }),
        ...(body.endAt !== undefined && { endAt: new Date(body.endAt) }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.channelId !== undefined && { channelId: body.channelId }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    const fullEvent = await getFullEvent(req.params.eventId, req.userId!);

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.emit('event:updated', fullEvent);
    }

    res.json({ data: fullEvent });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Delete event
router.delete('/:serverId/events/:eventId', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });

  const event = await prisma.scheduledEvent.findFirst({
    where: { id: req.params.eventId, serverId: req.params.serverId },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const isAdminOrOwner = member && ['owner', 'admin'].includes(member.role);
  const isCreator = event.creatorId === req.userId;
  if (!isAdminOrOwner && !isCreator) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  await prisma.scheduledEvent.delete({ where: { id: req.params.eventId } });

  const io = req.app.get('io') as Server | undefined;
  if (io) {
    io.emit('event:deleted', { eventId: req.params.eventId, serverId: req.params.serverId });
  }

  res.json({ data: { success: true } });
});

// Set RSVP
router.post('/:serverId/events/:eventId/rsvp', async (req, res) => {
  try {
    const body = rsvpSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member' });
      return;
    }

    const event = await prisma.scheduledEvent.findFirst({
      where: { id: req.params.eventId, serverId: req.params.serverId },
    });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    await prisma.eventRSVP.upsert({
      where: { userId_eventId: { userId: req.userId!, eventId: req.params.eventId } },
      create: { userId: req.userId!, eventId: req.params.eventId, status: body.status },
      update: { status: body.status },
    });

    const fullEvent = await getFullEvent(req.params.eventId, req.userId!);

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.emit('event:updated', fullEvent);
    }

    res.json({ data: fullEvent });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    throw err;
  }
});

// Remove RSVP
router.delete('/:serverId/events/:eventId/rsvp', async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const event = await prisma.scheduledEvent.findFirst({
    where: { id: req.params.eventId, serverId: req.params.serverId },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  await prisma.eventRSVP.deleteMany({
    where: { userId: req.userId!, eventId: req.params.eventId },
  });

  const fullEvent = await getFullEvent(req.params.eventId, req.userId!);

  const io = req.app.get('io') as Server | undefined;
  if (io) {
    io.emit('event:updated', fullEvent);
  }

  res.json({ data: fullEvent });
});

export default router;
