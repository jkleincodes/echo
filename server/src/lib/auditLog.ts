import { prisma } from './prisma.js';
import { logger } from './logger.js';

export type AuditActionType =
  | 'server_update' | 'icon_update'
  | 'channel_create' | 'channel_update' | 'channel_delete'
  | 'category_create' | 'category_update' | 'category_delete'
  | 'role_create' | 'role_update' | 'role_delete'
  | 'member_kick' | 'member_ban' | 'member_unban'
  | 'member_role_add' | 'member_role_remove';

interface AuditLogParams {
  actionType: AuditActionType;
  actorId: string;
  serverId: string;
  targetId?: string;
  targetType?: 'user' | 'channel' | 'role' | 'category' | 'server';
  changes?: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
}

export async function logAuditAction(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actionType: params.actionType,
        actorId: params.actorId,
        serverId: params.serverId,
        targetId: params.targetId ?? null,
        targetType: params.targetType ?? null,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        reason: params.reason ?? null,
      },
    });
  } catch (err) {
    logger.error(err, 'Failed to write audit log');
  }
}
