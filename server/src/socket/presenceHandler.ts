import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { UserStatus } from '../../../shared/types.js';

// Track online users: userId → Set<socketId> (connectivity, not apparent status)
const onlineUsers = new Map<string, Set<string>>();

// Track each user's *chosen* status (what they selected)
const userStatuses = new Map<string, UserStatus>();

// Track last heartbeat timestamp for server-side idle detection
const lastActivity = new Map<string, number>();

// Users who have been auto-idled by the server (not by their own choice)
const serverIdleUsers = new Set<string>();

const VALID_STATUSES: UserStatus[] = ['online', 'idle', 'dnd', 'invisible'];
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_CHECK_INTERVAL_MS = 60 * 1000; // check every 60 seconds

/**
 * Get the status that should be visible to other users.
 * Invisible users appear as offline to everyone else.
 */
export function getApparentStatus(userId: string): UserStatus {
  if (!onlineUsers.has(userId)) return 'offline';
  const chosen = userStatuses.get(userId) ?? 'online';
  if (chosen === 'invisible') return 'offline';
  // If server auto-idled and user's chosen status is 'online', show 'idle'
  if (serverIdleUsers.has(userId) && chosen === 'online') return 'idle';
  return chosen;
}

/**
 * Get apparent statuses for all connected users (for initial sync).
 * Invisible users are excluded entirely.
 */
export function getUserStatuses(): Record<string, UserStatus> {
  const result: Record<string, UserStatus> = {};
  for (const userId of onlineUsers.keys()) {
    const apparent = getApparentStatus(userId);
    if (apparent !== 'offline') {
      result[userId] = apparent;
    }
  }
  return result;
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

export function getSocketIdsForUser(userId: string): string[] {
  const sockets = onlineUsers.get(userId);
  return sockets ? Array.from(sockets) : [];
}

export async function getRelatedUserSocketIds(io: Server, userId: string): Promise<string[]> {
  try {
    const memberships = await prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = memberships.map((m) => m.serverId);

    const serverMembers = await prisma.member.findMany({
      where: { serverId: { in: serverIds } },
      select: { userId: true },
    });
    const relatedUserIds = new Set(serverMembers.map((m) => m.userId));

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

async function broadcastStatusChange(io: Server, userId: string) {
  const apparent = getApparentStatus(userId);
  const socketIds = await getRelatedUserSocketIds(io, userId);
  for (const sid of socketIds) {
    io.to(sid).emit('user:status-changed', { userId, status: apparent });
  }
}

export function registerPresenceHandler(io: Server, socket: Socket, userId: string) {
  const isFirstSocket = !onlineUsers.has(userId);

  // Track connectivity
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  // Initialize activity tracking
  lastActivity.set(userId, Date.now());

  if (isFirstSocket) {
    // Read persisted status from DB and set up presence
    prisma.user.findUnique({ where: { id: userId }, select: { status: true } })
      .then(async (user) => {
        const persisted = (user?.status ?? 'online') as UserStatus;

        // If they had 'offline' in DB (normal login), treat as 'online'
        const chosen = persisted === 'offline' ? 'online' : persisted;
        userStatuses.set(userId, chosen);

        // Persist the chosen status
        await prisma.user.update({ where: { id: userId }, data: { status: chosen } }).catch(() => {});

        // Broadcast apparent status to related users
        await broadcastStatusChange(io, userId);

        logger.info({ userId, status: chosen }, 'User came online');
      })
      .catch((err) => {
        // Fallback: set online
        userStatuses.set(userId, 'online');
        prisma.user.update({ where: { id: userId }, data: { status: 'online' } }).catch(() => {});
        broadcastStatusChange(io, userId);
        logger.error(err, 'Error reading persisted status');
      });
  }

  // Client sets their status
  socket.on('presence:set-status', async (data: { status: string }) => {
    const status = data?.status as UserStatus;
    if (!VALID_STATUSES.includes(status)) return;

    const previousApparent = getApparentStatus(userId);
    userStatuses.set(userId, status);
    serverIdleUsers.delete(userId); // clear server-idle if user explicitly sets status
    lastActivity.set(userId, Date.now());

    // Persist to DB
    await prisma.user.update({ where: { id: userId }, data: { status } }).catch(() => {});

    const newApparent = getApparentStatus(userId);
    if (newApparent !== previousApparent) {
      await broadcastStatusChange(io, userId);
    }

    // Notify all of this user's own sockets about the status change
    const ownSockets = onlineUsers.get(userId);
    if (ownSockets) {
      for (const sid of ownSockets) {
        io.to(sid).emit('presence:my-status', { status });
      }
    }

    logger.info({ userId, status }, 'User changed status');
  });

  // Client heartbeat for idle detection
  socket.on('presence:heartbeat', () => {
    lastActivity.set(userId, Date.now());

    // If user was server-idled and is now active, restore their status
    if (serverIdleUsers.has(userId)) {
      serverIdleUsers.delete(userId);
      broadcastStatusChange(io, userId);
    }
  });

  // Client explicitly reports activity (e.g. mouse move after being idle)
  socket.on('presence:activity', () => {
    lastActivity.set(userId, Date.now());

    if (serverIdleUsers.has(userId)) {
      serverIdleUsers.delete(userId);
      broadcastStatusChange(io, userId);
    }
  });

  socket.on('disconnect', () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        const chosen = userStatuses.get(userId);

        onlineUsers.delete(userId);
        userStatuses.delete(userId);
        lastActivity.delete(userId);
        serverIdleUsers.delete(userId);

        // If invisible, don't broadcast (others already think they're offline)
        // and keep 'invisible' in DB so it persists across sessions
        if (chosen === 'invisible') {
          // Keep invisible in DB — no broadcast needed
          logger.info({ userId }, 'Invisible user went offline');
        } else {
          // Broadcast offline and persist
          getRelatedUserSocketIds(io, userId).then((socketIds) => {
            for (const sid of socketIds) {
              io.to(sid).emit('user:status-changed', { userId, status: 'offline' });
            }
          });
          prisma.user.update({ where: { id: userId }, data: { status: 'offline' } }).catch(() => {});
          logger.info({ userId }, 'User went offline');
        }
      }
    }
  });
}

// Server-side idle detection interval
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startIdleDetection(io: Server) {
  if (idleCheckInterval) return;

  idleCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, lastTime] of lastActivity.entries()) {
      // Only auto-idle users whose chosen status is 'online' and who aren't already server-idled
      const chosen = userStatuses.get(userId);
      if (chosen !== 'online') continue;
      if (serverIdleUsers.has(userId)) continue;

      if (now - lastTime > IDLE_THRESHOLD_MS) {
        serverIdleUsers.add(userId);
        broadcastStatusChange(io, userId);
        logger.info({ userId }, 'User auto-idled by server');
      }
    }
  }, IDLE_CHECK_INTERVAL_MS);
}

export function stopIdleDetection() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}
