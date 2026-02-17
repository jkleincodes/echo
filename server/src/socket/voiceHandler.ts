import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { mediaService } from '../services/mediaService.js';
import { logger } from '../lib/logger.js';
import { getSocketIdsForUser } from './presenceHandler.js';
import type { ProducerMediaType, UserMediaState } from '../../../shared/types.js';

const voiceJoinSchema = z.object({ channelId: z.string().min(1) });
const createTransportSchema = z.object({ direction: z.enum(['send', 'recv']) });
const connectTransportSchema = z.object({ transportId: z.string().min(1), dtlsParameters: z.unknown() });
const produceSchema = z.object({ transportId: z.string().min(1), kind: z.string().min(1), rtpParameters: z.unknown(), mediaType: z.enum(['audio', 'video', 'screen', 'screen-audio']) });
const consumeSchema = z.object({ producerId: z.string().min(1), rtpCapabilities: z.unknown() });
const resumeConsumerSchema = z.object({ consumerId: z.string().min(1) });
const speakingSchema = z.object({ speaking: z.boolean() });
const voiceStateSchema = z.object({ muted: z.boolean(), deafened: z.boolean() });
const closeProducerSchema = z.object({ mediaType: z.enum(['audio', 'video', 'screen', 'screen-audio']) });
const mediaStateSchema = z.object({ cameraOn: z.boolean(), screenSharing: z.boolean() });
const moveUserSchema = z.object({ targetUserId: z.string().min(1), targetChannelId: z.string().min(1) });

// Track which channel each user is in: userId -> channelId
const userVoiceChannel = new Map<string, string>();
// Track which users are in each channel: channelId -> Set<userId>
const channelUsers = new Map<string, Set<string>>();
// Track recv transport per user
const userRecvTransport = new Map<string, string>(); // userId -> recv transportId
// Track per-user voice state (muted/deafened)
const userVoiceState = new Map<string, { muted: boolean; deafened: boolean }>();
// Track per-user media state (camera/screen)
const userMediaState = new Map<string, UserMediaState>();
// Track last voice activity timestamp per user (for AFK detection)
const userLastActivity = new Map<string, number>();

// Cache server AFK settings: serverId -> { afkChannelId, afkTimeout }
const serverAfkSettings = new Map<string, { afkChannelId: string | null; afkTimeout: number }>();

function touchActivity(userId: string) {
  if (userVoiceChannel.has(userId)) {
    userLastActivity.set(userId, Date.now());
  }
}

export function updateServerAfkCache(serverId: string, afkChannelId: string | null, afkTimeout: number) {
  serverAfkSettings.set(serverId, { afkChannelId, afkTimeout });
}

function isAfkChannel(channelId: string): boolean {
  for (const settings of serverAfkSettings.values()) {
    if (settings.afkChannelId === channelId) return true;
  }
  return false;
}

export function getUserVoiceChannel(userId: string): string | undefined {
  return userVoiceChannel.get(userId);
}

export function getAllVoiceStates(): Record<string, { muted: boolean; deafened: boolean }> {
  const result: Record<string, { muted: boolean; deafened: boolean }> = {};
  for (const [userId, state] of userVoiceState) {
    result[userId] = { ...state };
  }
  return result;
}

export function getAllMediaStates(): Record<string, UserMediaState> {
  const result: Record<string, UserMediaState> = {};
  for (const [userId, state] of userMediaState) {
    result[userId] = { ...state };
  }
  return result;
}

export function getAllVoiceChannelUsers(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [channelId, users] of channelUsers) {
    if (users.size > 0) {
      result[channelId] = Array.from(users);
    }
  }
  return result;
}

export function registerVoiceHandler(io: Server, socket: Socket, userId: string) {
  socket.on('voice:join', async (data: unknown, callback) => {
    try {
      logger.info({ userId, data }, '[VOICE] voice:join received');
      const parsed = voiceJoinSchema.safeParse(data);
      if (!parsed.success) { logger.warn({ userId }, '[VOICE] voice:join invalid data'); callback?.({ error: 'Invalid data' }); return; }

      const { channelId } = parsed.data;

      // Verify membership before joining voice
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel) { logger.warn({ userId, channelId }, '[VOICE] Channel not found'); callback?.({ error: 'Channel not found' }); return; }
      const member = await prisma.member.findUnique({
        where: { userId_serverId: { userId, serverId: channel.serverId } },
      });
      if (!member) {
        logger.warn({ userId, channelId }, '[VOICE] Unauthorized voice:join attempt');
        callback?.({ error: 'Not a member' });
        return;
      }

      // Leave current voice channel if in one
      const prevChannel = userVoiceChannel.get(userId);
      if (prevChannel) logger.info({ userId, prevChannel }, '[VOICE] Leaving previous voice channel before join');
      await leaveVoiceChannel(io, socket, userId);

      logger.info({ userId, channelId }, '[VOICE] Creating/getting router...');
      const router = await mediaService.getOrCreateRouter(channelId);
      logger.info({ userId, channelId, routerId: router.id }, '[VOICE] Router ready');

      userVoiceChannel.set(userId, channelId);
      if (!channelUsers.has(channelId)) channelUsers.set(channelId, new Set());
      channelUsers.get(channelId)!.add(userId);

      // Auto-mute in AFK channels (no voice/media allowed)
      const joiningAfk = isAfkChannel(channelId);
      userVoiceState.set(userId, { muted: joiningAfk, deafened: false });
      if (joiningAfk) {
        userMediaState.set(userId, { cameraOn: false, screenSharing: false });
      }
      touchActivity(userId);

      socket.join(`voice:${channelId}`);

      // Notify others (broadcast to all for sidebar display)
      socket.broadcast.emit('voice:user-joined', { userId, channelId });
      if (joiningAfk) {
        socket.broadcast.emit('voice:voice-state-update', { userId, muted: true, deafened: false });
        socket.broadcast.emit('voice:media-state-update', { userId, cameraOn: false, screenSharing: false });
      }

      // Send participant list for the joined channel
      const participants = Array.from(channelUsers.get(channelId)!);
      logger.info({ userId, channelId, participants }, '[VOICE] Channel participants');
      socket.emit('voice:participants', { channelId, participants });

      // Collect existing producers so the new joiner can consume them
      const existingProducers: { producerId: string; userId: string; mediaType: ProducerMediaType }[] = [];
      const channelProducerMap = mediaService.getChannelProducers(channelId);
      for (const [uid, producers] of channelProducerMap) {
        if (uid !== userId) {
          for (const [mt, pid] of Object.entries(producers)) {
            if (pid) {
              existingProducers.push({ producerId: pid, userId: uid, mediaType: mt as ProducerMediaType });
            }
          }
        }
      }

      logger.info({ userId, channelId, existingProducerCount: existingProducers.length, existingProducers }, '[VOICE] Sending join response');
      callback({ rtpCapabilities: router.rtpCapabilities, existingProducers });
      logger.info({ userId, channelId }, '[VOICE] User joined voice channel successfully');
    } catch (err) {
      logger.error(err, '[VOICE] Error joining voice channel');
      callback?.({ error: 'Failed to join voice channel' });
    }
  });

  socket.on('voice:leave', async () => {
    await leaveVoiceChannel(io, socket, userId);
  });

  socket.on('voice:create-transport', async (data: unknown, callback) => {
    try {
      const parsed = createTransportSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }

      const channelId = userVoiceChannel.get(userId);
      logger.info({ userId, direction: parsed.data.direction, channelId }, '[VOICE] voice:create-transport');
      if (!channelId) {
        logger.warn({ userId }, '[VOICE] Not in a voice channel for create-transport');
        callback({ error: 'Not in a voice channel' });
        return;
      }

      const transportData = await mediaService.createWebRtcTransport(channelId, userId);
      logger.info({ userId, direction: parsed.data.direction, transportId: transportData.id }, '[VOICE] Transport created');

      if (parsed.data.direction === 'recv') {
        userRecvTransport.set(userId, transportData.id);
      }

      callback(transportData);
    } catch (err) {
      logger.error(err, '[VOICE] Error creating transport');
      callback?.({ error: 'Failed to create transport' });
    }
  });

  socket.on('voice:connect-transport', async (data: unknown, callback) => {
    try {
      const parsed = connectTransportSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }
      logger.info({ userId, transportId: parsed.data.transportId }, '[VOICE] voice:connect-transport');
      await mediaService.connectTransport(parsed.data.transportId, parsed.data.dtlsParameters as any);
      logger.info({ userId, transportId: parsed.data.transportId }, '[VOICE] Transport connected successfully');
      callback?.();
    } catch (err) {
      logger.error(err, '[VOICE] Error connecting transport');
      callback?.({ error: 'Failed to connect transport' });
    }
  });

  socket.on('voice:produce', async (data: unknown, callback) => {
    try {
      const parsed = produceSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }

      const channelId = userVoiceChannel.get(userId);
      logger.info({ userId, channelId, kind: parsed.data.kind, mediaType: parsed.data.mediaType }, '[VOICE] voice:produce');
      if (!channelId) {
        logger.warn({ userId }, '[VOICE] Not in a voice channel for produce');
        callback?.({ error: 'Not in a voice channel' });
        return;
      }

      // Block producing in AFK channels
      if (isAfkChannel(channelId)) {
        logger.warn({ userId, channelId }, '[VOICE] Blocked produce in AFK channel');
        callback?.({ error: 'Cannot transmit in AFK channel' });
        return;
      }

      const { mediaType } = parsed.data;
      touchActivity(userId);
      const producerId = await mediaService.produce(
        parsed.data.transportId,
        parsed.data.kind as any,
        parsed.data.rtpParameters as any,
        channelId,
        userId,
        mediaType,
      );
      logger.info({ userId, channelId, producerId, mediaType }, '[VOICE] Producer created');

      // Notify others about the new producer
      const roomMembers = Array.from(channelUsers.get(channelId) || []).filter(u => u !== userId);
      logger.info({ userId, channelId, producerId, mediaType, notifying: roomMembers }, '[VOICE] Notifying voice:new-producer');
      socket.to(`voice:${channelId}`).emit('voice:new-producer', { producerId, userId, mediaType });

      callback({ producerId });
    } catch (err) {
      logger.error(err, '[VOICE] Error producing');
      callback?.({ error: 'Failed to produce' });
    }
  });

  socket.on('voice:close-producer', (data: unknown) => {
    const parsed = closeProducerSchema.safeParse(data);
    if (!parsed.success) return;

    const channelId = userVoiceChannel.get(userId);
    if (!channelId) return;

    const { mediaType } = parsed.data;
    const producerId = mediaService.closeProducer(channelId, userId, mediaType);
    if (producerId) {
      socket.to(`voice:${channelId}`).emit('voice:producer-closed', { producerId, userId, mediaType });
    }
  });

  socket.on('voice:media-state-update', (data: unknown) => {
    const parsed = mediaStateSchema.safeParse(data);
    if (!parsed.success) return;
    touchActivity(userId);
    userMediaState.set(userId, { cameraOn: parsed.data.cameraOn, screenSharing: parsed.data.screenSharing });
    socket.broadcast.emit('voice:media-state-update', { userId, cameraOn: parsed.data.cameraOn, screenSharing: parsed.data.screenSharing });
  });

  socket.on('voice:consume', async (data: unknown, callback) => {
    try {
      const parsed = consumeSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }

      const channelId = userVoiceChannel.get(userId);
      logger.info({ userId, channelId, producerId: parsed.data.producerId }, '[VOICE] voice:consume');
      if (!channelId) {
        logger.warn({ userId }, '[VOICE] Not in a voice channel for consume');
        callback?.({ error: 'Not in a voice channel' });
        return;
      }

      const recvTransportId = userRecvTransport.get(userId);
      if (!recvTransportId) {
        logger.warn({ userId }, '[VOICE] No recv transport for consume');
        callback?.({ error: 'No recv transport' });
        return;
      }

      logger.info({ userId, recvTransportId, producerId: parsed.data.producerId }, '[VOICE] Consuming via mediaService...');
      const consumerData = await mediaService.consume(
        recvTransportId,
        parsed.data.producerId,
        parsed.data.rtpCapabilities as any,
        channelId,
      );
      logger.info({ userId, consumerId: consumerData.consumerId, kind: consumerData.kind }, '[VOICE] Consumer created');

      // Find the userId and mediaType of the producer
      const producers = mediaService.getChannelProducers(channelId);
      let producerUserId = '';
      let producerMediaType: ProducerMediaType = 'audio';
      for (const [uid, userProducers] of producers) {
        for (const [mt, pid] of Object.entries(userProducers)) {
          if (pid === parsed.data.producerId) {
            producerUserId = uid;
            producerMediaType = mt as ProducerMediaType;
            break;
          }
        }
        if (producerUserId) break;
      }
      logger.info({ userId, producerUserId, producerMediaType }, '[VOICE] Found producer owner');

      callback(consumerData);

      // Also send userId and mediaType info
      socket.emit('voice:consumed', { ...consumerData, userId: producerUserId, mediaType: producerMediaType });
    } catch (err) {
      logger.error(err, '[VOICE] Error consuming');
      callback?.({ error: 'Failed to consume' });
    }
  });

  socket.on('voice:resume-consumer', async (data: unknown, callback) => {
    try {
      const parsed = resumeConsumerSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }
      logger.info({ userId, consumerId: parsed.data.consumerId }, '[VOICE] voice:resume-consumer');
      await mediaService.resumeConsumer(parsed.data.consumerId);
      logger.info({ userId, consumerId: parsed.data.consumerId }, '[VOICE] Consumer resumed');
      callback?.();
    } catch (err) {
      logger.error(err, '[VOICE] Error resuming consumer');
      callback?.({ error: 'Failed to resume consumer' });
    }
  });

  socket.on('voice:speaking', (data: unknown) => {
    const parsed = speakingSchema.safeParse(data);
    if (!parsed.success) return;
    const channelId = userVoiceChannel.get(userId);
    if (!channelId) return;
    if (parsed.data.speaking) touchActivity(userId);
    socket.to(`voice:${channelId}`).emit('voice:speaking', { userId, speaking: parsed.data.speaking });
  });

  socket.on('voice:voice-state-update', (data: unknown) => {
    const parsed = voiceStateSchema.safeParse(data);
    if (!parsed.success) return;
    touchActivity(userId);

    // Force muted in AFK channels
    const currentChannel = userVoiceChannel.get(userId);
    const inAfk = currentChannel ? isAfkChannel(currentChannel) : false;
    const muted = inAfk ? true : parsed.data.muted;

    userVoiceState.set(userId, { muted, deafened: parsed.data.deafened });
    socket.broadcast.emit('voice:voice-state-update', { userId, muted, deafened: parsed.data.deafened });
    // If client tried to unmute in AFK, push back the forced mute
    if (inAfk && !parsed.data.muted) {
      socket.emit('voice:force-mute', { muted: true });
    }
  });

  // Admin moves a user to another voice channel
  socket.on('voice:move-user', async (data: unknown, callback) => {
    try {
      const parsed = moveUserSchema.safeParse(data);
      if (!parsed.success) { callback?.({ error: 'Invalid data' }); return; }

      const { targetUserId, targetChannelId } = parsed.data;

      // Verify the target user is actually in a voice channel
      const currentChannelId = userVoiceChannel.get(targetUserId);
      if (!currentChannelId) { callback?.({ error: 'User not in a voice channel' }); return; }
      if (currentChannelId === targetChannelId) { callback?.({ error: 'User already in that channel' }); return; }

      // Verify the requesting user is admin/owner in the server
      const targetChannel = await prisma.channel.findUnique({ where: { id: targetChannelId }, select: { serverId: true, type: true } });
      if (!targetChannel) { callback?.({ error: 'Channel not found' }); return; }
      if (targetChannel.type !== 'voice') { callback?.({ error: 'Target must be a voice channel' }); return; }

      const actorMember = await prisma.member.findUnique({
        where: { userId_serverId: { userId, serverId: targetChannel.serverId } },
      });
      if (!actorMember || !['owner', 'admin'].includes(actorMember.role)) {
        callback?.({ error: 'Insufficient permissions' });
        return;
      }

      logger.info({ actorId: userId, targetUserId, fromChannel: currentChannelId, toChannel: targetChannelId }, '[VOICE] Admin moving user');

      // Close all producers for the target user
      const channelProducers = mediaService.getChannelProducers(currentChannelId);
      const targetProducers = channelProducers.get(targetUserId);
      if (targetProducers) {
        for (const [mt, pid] of Object.entries(targetProducers)) {
          if (pid) {
            mediaService.closeProducer(currentChannelId, targetUserId, mt as ProducerMediaType);
            io.to(`voice:${currentChannelId}`).emit('voice:producer-closed', { producerId: pid, userId: targetUserId, mediaType: mt });
          }
        }
      }

      // Clean up old channel state
      userVoiceChannel.delete(targetUserId);
      userRecvTransport.delete(targetUserId);
      channelUsers.get(currentChannelId)?.delete(targetUserId);
      mediaService.cleanupUser(targetUserId);

      // Emit leave from old channel
      io.emit('voice:user-left', { userId: targetUserId, channelId: currentChannelId });

      // Clean up empty channel router
      const remaining = channelUsers.get(currentChannelId)?.size ?? 0;
      if (remaining === 0) {
        channelUsers.delete(currentChannelId);
        mediaService.cleanupRouter(currentChannelId);
      }

      // Tell the target user's sockets to move
      const socketIds = getSocketIdsForUser(targetUserId);
      for (const sid of socketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.leave(`voice:${currentChannelId}`);
          s.emit('voice:move', { channelId: targetChannelId });
        }
      }

      callback?.({ success: true });
    } catch (err) {
      logger.error(err, '[VOICE] Error moving user');
      callback?.({ error: 'Failed to move user' });
    }
  });

  socket.on('disconnect', async () => {
    await leaveVoiceChannel(io, socket, userId);
  });
}

async function leaveVoiceChannel(io: Server, socket: Socket, userId: string) {
  const channelId = userVoiceChannel.get(userId);
  if (!channelId) {
    logger.info({ userId }, '[VOICE] leaveVoiceChannel: user not in any channel');
    return;
  }

  logger.info({ userId, channelId }, '[VOICE] leaveVoiceChannel: leaving...');
  userVoiceChannel.delete(userId);
  userRecvTransport.delete(userId);
  userVoiceState.delete(userId);
  userMediaState.delete(userId);
  userLastActivity.delete(userId);
  channelUsers.get(channelId)?.delete(userId);

  socket.leave(`voice:${channelId}`);
  // Broadcast to all for sidebar display
  io.emit('voice:user-left', { userId, channelId });

  mediaService.cleanupUser(userId);

  // Clean up empty channel router
  const remainingUsers = channelUsers.get(channelId)?.size ?? 0;
  logger.info({ userId, channelId, remainingUsers }, '[VOICE] Channel state after leave');
  if (remainingUsers === 0) {
    channelUsers.delete(channelId);
    mediaService.cleanupRouter(channelId);
    logger.info({ channelId }, '[VOICE] Cleaned up empty channel router');
  }

  logger.info({ userId, channelId }, '[VOICE] User left voice channel');
}

// ── AFK Checker ──

async function loadAllAfkSettings() {
  try {
    const servers = await prisma.server.findMany({
      where: { afkChannelId: { not: null } },
      select: { id: true, afkChannelId: true, afkTimeout: true },
    });
    for (const s of servers) {
      serverAfkSettings.set(s.id, { afkChannelId: s.afkChannelId, afkTimeout: s.afkTimeout });
    }
    logger.info({ count: servers.length }, '[AFK] Loaded AFK settings');
  } catch (err) {
    logger.error(err, '[AFK] Failed to load AFK settings');
  }
}

export function startAfkChecker(io: Server) {
  // Load initial settings
  loadAllAfkSettings();

  setInterval(async () => {
    const now = Date.now();

    // Build channelId -> serverId map for active voice channels
    const channelServerMap = new Map<string, string>();
    const channelIdsWithUsers = new Set<string>();
    for (const [channelId, users] of channelUsers) {
      if (users.size > 0) channelIdsWithUsers.add(channelId);
    }

    if (channelIdsWithUsers.size === 0) return;

    // Batch-fetch channel -> serverId mappings
    try {
      const channels = await prisma.channel.findMany({
        where: { id: { in: Array.from(channelIdsWithUsers) } },
        select: { id: true, serverId: true },
      });
      for (const ch of channels) {
        channelServerMap.set(ch.id, ch.serverId);
      }
    } catch (err) {
      logger.error(err, '[AFK] Failed to fetch channel-server mappings');
      return;
    }

    // Group users by serverId
    const serverUsers = new Map<string, { userId: string; channelId: string }[]>();
    for (const [userId, channelId] of userVoiceChannel) {
      const serverId = channelServerMap.get(channelId);
      if (!serverId) continue;
      if (!serverUsers.has(serverId)) serverUsers.set(serverId, []);
      serverUsers.get(serverId)!.push({ userId, channelId });
    }

    // Check each server's AFK settings
    for (const [serverId, users] of serverUsers) {
      const settings = serverAfkSettings.get(serverId);
      if (!settings?.afkChannelId) continue;

      const { afkChannelId, afkTimeout } = settings;
      const timeoutMs = afkTimeout * 1000;

      for (const { userId, channelId } of users) {
        // Skip users already in the AFK channel
        if (channelId === afkChannelId) continue;

        const lastActivity = userLastActivity.get(userId);
        if (!lastActivity) continue;

        if (now - lastActivity < timeoutMs) continue;

        // User is AFK — move them
        logger.info({ userId, fromChannel: channelId, toChannel: afkChannelId, serverId }, '[AFK] Moving idle user to AFK channel');

        // Close all producers (audio, video, screen) before moving
        const channelProducers = mediaService.getChannelProducers(channelId);
        const userProducers = channelProducers.get(userId);
        if (userProducers) {
          for (const [mt, pid] of Object.entries(userProducers)) {
            if (pid) {
              mediaService.closeProducer(channelId, userId, mt as ProducerMediaType);
              io.to(`voice:${channelId}`).emit('voice:producer-closed', { producerId: pid, userId, mediaType: mt });
            }
          }
        }

        // Clean up old channel state
        userVoiceChannel.delete(userId);
        userRecvTransport.delete(userId);
        channelUsers.get(channelId)?.delete(userId);
        mediaService.cleanupUser(userId);

        // Set muted state for AFK channel
        userVoiceState.set(userId, { muted: true, deafened: false });
        userMediaState.set(userId, { cameraOn: false, screenSharing: false });

        // Emit leave from old channel
        io.emit('voice:user-left', { userId, channelId });

        // Broadcast forced mute/media state
        io.emit('voice:voice-state-update', { userId, muted: true, deafened: false });
        io.emit('voice:media-state-update', { userId, cameraOn: false, screenSharing: false });

        // Clean up empty channel router
        const remaining = channelUsers.get(channelId)?.size ?? 0;
        if (remaining === 0) {
          channelUsers.delete(channelId);
          mediaService.cleanupRouter(channelId);
        }

        // Remove from old voice room and emit afk-move to user's sockets
        const socketIds = getSocketIdsForUser(userId);
        for (const sid of socketIds) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.leave(`voice:${channelId}`);
            s.emit('voice:afk-move', { channelId: afkChannelId });
          }
        }

        // Reset activity so they don't get immediately moved again if they rejoin
        userLastActivity.delete(userId);
      }
    }
  }, 30_000);
}
