import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { invalidateNotificationCache } from '../lib/notificationHelper.js';

const bulkRouter = Router();
bulkRouter.use(authMiddleware);

const scopedRouter = Router();
scopedRouter.use(authMiddleware);

// ── Bulk fetch all notification preferences for the authenticated user ──

bulkRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId!;

    const [serverPreferences, channelOverrides] = await Promise.all([
      prisma.notificationPreference.findMany({ where: { userId } }),
      prisma.channelNotificationOverride.findMany({ where: { userId } }),
    ]);

    res.json({
      data: {
        serverPreferences: serverPreferences.map((p) => ({
          id: p.id,
          userId: p.userId,
          serverId: p.serverId,
          level: p.level,
          muted: p.muted,
          mutedUntil: p.mutedUntil?.toISOString() ?? null,
          suppressEveryone: p.suppressEveryone,
          suppressHere: p.suppressHere,
        })),
        channelOverrides: channelOverrides.map((o) => ({
          id: o.id,
          userId: o.userId,
          channelId: o.channelId,
          level: o.level,
          muted: o.muted,
          mutedUntil: o.mutedUntil?.toISOString() ?? null,
        })),
      },
    });
  } catch (err) {
    throw err;
  }
});

// ── Upsert server-level notification preference ──

const updateServerPrefSchema = z.object({
  level: z.enum(['everything', 'mentions', 'nothing']).optional(),
  muted: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
  suppressEveryone: z.boolean().optional(),
  suppressHere: z.boolean().optional(),
});

scopedRouter.put('/:serverId/notification-preferences', async (req, res) => {
  try {
    const userId = req.userId!;
    const { serverId } = req.params;
    const body = updateServerPrefSchema.parse(req.body);

    // Verify membership
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }

    const pref = await prisma.notificationPreference.upsert({
      where: { userId_serverId: { userId, serverId } },
      create: {
        userId,
        serverId,
        level: body.level ?? 'everything',
        muted: body.muted ?? false,
        mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null,
        suppressEveryone: body.suppressEveryone ?? false,
        suppressHere: body.suppressHere ?? false,
      },
      update: {
        ...(body.level !== undefined && { level: body.level }),
        ...(body.muted !== undefined && { muted: body.muted }),
        ...(body.mutedUntil !== undefined && { mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null }),
        ...(body.suppressEveryone !== undefined && { suppressEveryone: body.suppressEveryone }),
        ...(body.suppressHere !== undefined && { suppressHere: body.suppressHere }),
      },
    });

    invalidateNotificationCache(userId, serverId);

    res.json({
      data: {
        id: pref.id,
        userId: pref.userId,
        serverId: pref.serverId,
        level: pref.level,
        muted: pref.muted,
        mutedUntil: pref.mutedUntil?.toISOString() ?? null,
        suppressEveryone: pref.suppressEveryone,
        suppressHere: pref.suppressHere,
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

// ── Upsert channel notification override ──

const updateChannelOverrideSchema = z.object({
  level: z.enum(['default', 'everything', 'mentions', 'nothing']).optional(),
  muted: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
});

scopedRouter.put('/:serverId/channels/:channelId/notification-override', async (req, res) => {
  try {
    const userId = req.userId!;
    const { serverId, channelId } = req.params;
    const body = updateChannelOverrideSchema.parse(req.body);

    // Verify membership
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }

    // Verify channel belongs to server
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.serverId !== serverId) {
      res.status(404).json({ error: 'Channel not found in this server' });
      return;
    }

    const override = await prisma.channelNotificationOverride.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: {
        userId,
        channelId,
        level: body.level ?? 'default',
        muted: body.muted ?? false,
        mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null,
      },
      update: {
        ...(body.level !== undefined && { level: body.level }),
        ...(body.muted !== undefined && { muted: body.muted }),
        ...(body.mutedUntil !== undefined && { mutedUntil: body.mutedUntil ? new Date(body.mutedUntil) : null }),
      },
    });

    invalidateNotificationCache(userId, serverId, channelId);

    res.json({
      data: {
        id: override.id,
        userId: override.userId,
        channelId: override.channelId,
        level: override.level,
        muted: override.muted,
        mutedUntil: override.mutedUntil?.toISOString() ?? null,
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

// ── Delete channel notification override ──

scopedRouter.delete('/:serverId/channels/:channelId/notification-override', async (req, res) => {
  const userId = req.userId!;
  const { serverId, channelId } = req.params;

  // Verify membership
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member of this server' });
    return;
  }

  await prisma.channelNotificationOverride.deleteMany({
    where: { userId, channelId },
  });

  invalidateNotificationCache(userId, serverId, channelId);

  res.json({ data: { success: true } });
});

export { bulkRouter, scopedRouter };
