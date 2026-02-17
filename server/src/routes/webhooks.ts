import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { MESSAGE_INCLUDE, serializeMessage } from '../lib/serializers.js';
import { emitUnreadUpdates, generateEmbeds } from '../socket/chatHandler.js';

// ── Rate limiter (in-memory) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // messages per minute

function checkRateLimit(webhookId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(webhookId);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(webhookId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Schemas ──
const createWebhookSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  channelId: z.string().min(1),
  avatarUrl: z.string().url().max(2048).optional().nullable(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  channelId: z.string().min(1).optional(),
  avatarUrl: z.string().url().max(2048).optional().nullable(),
});

const executeWebhookSchema = z.object({
  content: z.string().min(1).max(2000),
  username: z.string().min(1).max(80).optional(),
  avatar_url: z.string().url().max(2048).optional(),
});

// ── CRUD router (authenticated, admin-only) ──
export const webhookCrudRouter = Router();
webhookCrudRouter.use(authMiddleware);

// Create webhook
webhookCrudRouter.post('/:serverId/webhooks', async (req, res) => {
  try {
    const body = createWebhookSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Verify channel belongs to this server and is a text channel
    const channel = await prisma.channel.findUnique({ where: { id: body.channelId } });
    if (!channel || channel.serverId !== req.params.serverId || channel.type !== 'text') {
      res.status(400).json({ error: 'Invalid channel' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: {
        name: body.name,
        avatarUrl: body.avatarUrl ?? null,
        token,
        channelId: body.channelId,
        serverId: req.params.serverId,
        creatorId: req.userId!,
      },
    });

    res.status(201).json({ data: webhook });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List webhooks for a server
webhookCrudRouter.get('/:serverId/webhooks', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const webhooks = await prisma.webhook.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: webhooks });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update webhook
webhookCrudRouter.patch('/:serverId/webhooks/:webhookId', async (req, res) => {
  try {
    const body = updateWebhookSchema.parse(req.body);
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook || webhook.serverId !== req.params.serverId) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // If changing channel, verify it belongs to this server
    if (body.channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: body.channelId } });
      if (!channel || channel.serverId !== req.params.serverId || channel.type !== 'text') {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }
    }

    const updated = await prisma.webhook.update({
      where: { id: req.params.webhookId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.channelId !== undefined && { channelId: body.channelId }),
        ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
      },
    });

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete webhook
webhookCrudRouter.delete('/:serverId/webhooks/:webhookId', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook || webhook.serverId !== req.params.serverId) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    await prisma.webhook.delete({ where: { id: req.params.webhookId } });
    res.json({ data: { success: true } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Execute router (public, no auth) ──
export const webhookExecuteRouter = Router();

webhookExecuteRouter.post('/:webhookId/:token', async (req, res) => {
  try {
    const body = executeWebhookSchema.parse(req.body);

    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook || webhook.token !== req.params.token) {
      res.status(404).json({ error: 'Unknown webhook' });
      return;
    }

    // Rate limit
    if (!checkRateLimit(webhook.id)) {
      res.status(429).json({ error: 'Rate limited. Max 30 messages per minute per webhook.' });
      return;
    }

    // Create the message using the webhook's creator as the author
    const message = await prisma.message.create({
      data: {
        content: body.content,
        channelId: webhook.channelId,
        authorId: webhook.creatorId,
        webhookId: webhook.id,
      },
      include: MESSAGE_INCLUDE,
    });

    const serialized = serializeMessage(message);

    // Override webhook display name/avatar if provided in the execute payload
    if (body.username) {
      serialized.webhookName = body.username;
    }
    if (body.avatar_url) {
      serialized.webhookAvatarUrl = body.avatar_url;
    }

    // Broadcast via Socket.IO
    const { io } = await import('../index.js');
    io.to(`channel:${webhook.channelId}`).emit('message:new', serialized);

    // Fire-and-forget: unread updates and embed generation
    emitUnreadUpdates(io, webhook.channelId, webhook.creatorId, []);
    generateEmbeds(io, message.id, webhook.channelId, body.content);

    res.status(201).json({ data: serialized });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
