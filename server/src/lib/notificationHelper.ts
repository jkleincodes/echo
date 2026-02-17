import { prisma } from './prisma.js';

interface NotificationResult {
  shouldNotify: boolean;
}

// In-memory caches to avoid DB queries on every message
const serverPrefCache = new Map<string, {
  level: string;
  muted: boolean;
  mutedUntil: Date | null;
  suppressEveryone: boolean;
  suppressHere: boolean;
} | null>();

const channelOverrideCache = new Map<string, {
  level: string;
  muted: boolean;
  mutedUntil: Date | null;
} | null>();

export function invalidateNotificationCache(userId: string, serverId: string, channelId?: string) {
  serverPrefCache.delete(`${userId}:${serverId}`);
  if (channelId) {
    channelOverrideCache.delete(`${userId}:${channelId}`);
  }
}

function isMuted(muted: boolean, mutedUntil: Date | null): boolean {
  if (!muted) return false;
  if (!mutedUntil) return true; // indefinitely muted
  return new Date() < mutedUntil;
}

async function getServerPref(userId: string, serverId: string) {
  const key = `${userId}:${serverId}`;
  if (serverPrefCache.has(key)) return serverPrefCache.get(key)!;

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });

  const result = pref ? {
    level: pref.level,
    muted: pref.muted,
    mutedUntil: pref.mutedUntil,
    suppressEveryone: pref.suppressEveryone,
    suppressHere: pref.suppressHere,
  } : null;

  serverPrefCache.set(key, result);
  return result;
}

async function getChannelOverride(userId: string, channelId: string) {
  const key = `${userId}:${channelId}`;
  if (channelOverrideCache.has(key)) return channelOverrideCache.get(key)!;

  const override = await prisma.channelNotificationOverride.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  const result = override ? {
    level: override.level,
    muted: override.muted,
    mutedUntil: override.mutedUntil,
  } : null;

  channelOverrideCache.set(key, result);
  return result;
}

export async function shouldNotifyUser(
  userId: string,
  serverId: string,
  channelId: string,
  mentionedUserIds: string[],
  mentionEveryone: boolean,
  mentionHere: boolean,
): Promise<NotificationResult> {
  const channelOverride = await getChannelOverride(userId, channelId);
  const serverPref = await getServerPref(userId, serverId);

  // Check channel-level mute first
  if (channelOverride && isMuted(channelOverride.muted, channelOverride.mutedUntil)) {
    return { shouldNotify: false };
  }

  // Check server-level mute
  if (serverPref && isMuted(serverPref.muted, serverPref.mutedUntil)) {
    return { shouldNotify: false };
  }

  // Resolve effective level: channel override > server pref > default "everything"
  let effectiveLevel = 'everything';
  if (serverPref) {
    effectiveLevel = serverPref.level;
  }
  if (channelOverride && channelOverride.level !== 'default') {
    effectiveLevel = channelOverride.level;
  }

  const suppressEveryone = serverPref?.suppressEveryone ?? false;
  const suppressHere = serverPref?.suppressHere ?? false;

  switch (effectiveLevel) {
    case 'everything':
      return { shouldNotify: true };

    case 'mentions': {
      if (mentionedUserIds.includes(userId)) return { shouldNotify: true };
      if (mentionEveryone && !suppressEveryone) return { shouldNotify: true };
      if (mentionHere && !suppressHere) return { shouldNotify: true };
      return { shouldNotify: false };
    }

    case 'nothing':
      return { shouldNotify: false };

    default:
      return { shouldNotify: true };
  }
}
