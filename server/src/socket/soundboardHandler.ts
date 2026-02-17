import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getUserVoiceChannel } from './voiceHandler.js';

const soundboardPlaySchema = z.object({
  soundId: z.string().min(1),
  volume: z.number().min(0).max(1).optional(),
});

// Simple rate limiting: userId -> timestamps of recent plays
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10_000;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(userId, recent);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  return false;
}

export function registerSoundboardHandler(io: Server, socket: Socket, userId: string) {
  socket.on('soundboard:play', async (data: unknown, callback) => {
    try {
      const parsed = soundboardPlaySchema.safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid data' });
        return;
      }

      const { soundId, volume = 1 } = parsed.data;

      // Check rate limit
      if (isRateLimited(userId)) {
        callback?.({ success: false, error: 'Too many sounds, slow down!' });
        return;
      }

      // Check user is in a voice channel
      const channelId = getUserVoiceChannel(userId);
      if (!channelId) {
        callback?.({ success: false, error: 'Not in a voice channel' });
        return;
      }

      // Look up sound
      const sound = await prisma.soundboardSound.findUnique({ where: { id: soundId } });
      if (!sound) {
        callback?.({ success: false, error: 'Sound not found' });
        return;
      }

      // Verify the sound belongs to the same server as the voice channel
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel || channel.serverId !== sound.serverId) {
        callback?.({ success: false, error: 'Sound does not belong to this server' });
        return;
      }

      const soundUrl = `/uploads/${sound.filename}`;

      // Broadcast to all users in the voice channel (including sender)
      io.to(`voice:${channelId}`).emit('soundboard:play', {
        soundId,
        soundUrl,
        userId,
        volume,
      });

      callback?.({ success: true });
    } catch (err) {
      logger.error(err, '[SOUNDBOARD] Error playing sound');
      callback?.({ success: false, error: 'Failed to play sound' });
    }
  });
}
