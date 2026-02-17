import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Track online users: userId → Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

export function getSocketIdsForUser(userId: string): string[] {
  const sockets = onlineUsers.get(userId);
  return sockets ? Array.from(sockets) : [];
}

export async function getRelatedUserSocketIds(io: Server, userId: string): Promise<string[]> {
  try {
    // Find all servers this user is in
    const memberships = await prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = memberships.map((m) => m.serverId);

    // Find all users in those servers
    const serverMembers = await prisma.member.findMany({
      where: { serverId: { in: serverIds } },
      select: { userId: true },
    });
    const relatedUserIds = new Set(serverMembers.map((m) => m.userId));

    // Also include friends
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    for (const f of friendships) {
      relatedUserIds.add(f.senderId === userId ? f.receiverId : f.senderId);
    }

    // Collect socket IDs for all related users
    const socketIds: string[] = [];
    for (const uid of relatedUserIds) {
      if (uid === userId) continue;
      const sockets = onlineUsers.get(uid);
      if (sockets) {
        for (const sid of sockets) {
          socketIds.push(sid);
        }
      }
    }
    return socketIds;
  } catch (err) {
    logger.error(err, 'Error getting related user socket IDs');
    return [];
  }
}

export function registerPresenceHandler(io: Server, socket: Socket, userId: string) {
  // Mark user online
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
    // Broadcast only to related users (shared servers + friends)
    getRelatedUserSocketIds(io, userId).then((socketIds) => {
      for (const sid of socketIds) {
        io.to(sid).emit('user:online', userId);
      }
    });
    prisma.user.update({ where: { id: userId }, data: { status: 'online' } }).catch(() => {});
    logger.info({ userId }, 'User came online');
  }
  onlineUsers.get(userId)!.add(socket.id);

  socket.on('disconnect', () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        getRelatedUserSocketIds(io, userId).then((socketIds) => {
          for (const sid of socketIds) {
            io.to(sid).emit('user:offline', userId);
          }
        });
        prisma.user.update({ where: { id: userId }, data: { status: 'offline' } }).catch(() => {});
        logger.info({ userId }, 'User went offline');
      }
    }
  });
}
