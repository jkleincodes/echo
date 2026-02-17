import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const typingStartSchema = z.object({ channelId: z.string().min(1) });

// Track typing state: channelId -> Map<userId, timeout>
const typingState = new Map<string, Map<string, NodeJS.Timeout>>();

const TYPING_TIMEOUT = 5000;

export function clearTypingForUser(io: Server, channelId: string, userId: string) {
  const channelTyping = typingState.get(channelId);
  if (!channelTyping) return;
  const timeout = channelTyping.get(userId);
  if (timeout) {
    clearTimeout(timeout);
    channelTyping.delete(userId);
    if (channelTyping.size === 0) typingState.delete(channelId);
    io.to(`channel:${channelId}`).emit('typing:stop', { channelId, userId });
  }
}

export function registerTypingHandler(io: Server, socket: Socket, userId: string) {
  socket.on('typing:start', async (data: unknown) => {
    try {
      const parsed = typingStartSchema.safeParse(data);
      if (!parsed.success) return;

      const { channelId } = parsed.data;

      // Get user info for broadcast
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      if (!user) return;

      if (!typingState.has(channelId)) {
        typingState.set(channelId, new Map());
      }
      const channelTyping = typingState.get(channelId)!;

      // Clear existing timeout
      const existingTimeout = channelTyping.get(userId);
      if (existingTimeout) clearTimeout(existingTimeout);

      // Set auto-stop timeout
      const timeout = setTimeout(() => {
        channelTyping.delete(userId);
        if (channelTyping.size === 0) typingState.delete(channelId);
        socket.to(`channel:${channelId}`).emit('typing:stop', { channelId, userId });
      }, TYPING_TIMEOUT);

      const wasTyping = channelTyping.has(userId);
      channelTyping.set(userId, timeout);

      // Only broadcast start if wasn't already typing
      if (!wasTyping) {
        socket.to(`channel:${channelId}`).emit('typing:start', {
          channelId,
          userId,
          username: user.displayName,
        });
      }
    } catch (err) {
      logger.error(err, 'Error handling typing:start');
    }
  });

  socket.on('disconnect', () => {
    // Clear all typing states for this user
    for (const [channelId, channelTyping] of typingState.entries()) {
      const timeout = channelTyping.get(userId);
      if (timeout) {
        clearTimeout(timeout);
        channelTyping.delete(userId);
        if (channelTyping.size === 0) typingState.delete(channelId);
        socket.to(`channel:${channelId}`).emit('typing:stop', { channelId, userId });
      }
    }
  });
}
