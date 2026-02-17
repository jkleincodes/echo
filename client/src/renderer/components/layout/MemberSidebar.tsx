import { useState, type MouseEvent } from 'react';
import { UserMinus, ShieldBan } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import Avatar from '../ui/Avatar';
import ContextMenu, { type ContextMenuItem } from '../ui/ContextMenu';
import UserProfileModal from '../modals/UserProfileModal';
import type { Member, Role } from '../../../../../shared/types';

function getRoleColor(memberRoles?: { role: Role }[]): string | undefined {
  if (!memberRoles || memberRoles.length === 0) return undefined;
  const sorted = [...memberRoles].sort((a, b) => b.role.position - a.role.position);
  for (const mr of sorted) {
    if (mr.role.color) return mr.role.color;
  }
  return undefined;
}

interface MemberContextMenu {
  x: number;
  y: number;
  member: Member;
}

export default function MemberSidebar() {
  const members = useServerStore((s) => s.members);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const removeMember = useServerStore((s) => s.removeMember);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const { canKickMembers, isOwner } = usePermissions();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<MemberContextMenu | null>(null);

  const onlineMembers = members.filter((m) => onlineUsers.has(m.userId));
  const offlineMembers = members.filter((m) => !onlineUsers.has(m.userId));

  const handleContextMenu = (e: MouseEvent, member: Member) => {
    // Only show for users with kick permission, and never for the owner
    if (!canKickMembers || member.role === 'owner') return;
    // Admins can only be kicked/banned by the owner
    if (member.role === 'admin' && !isOwner) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, member });
  };

  const handleKick = async (member: Member) => {
    if (!activeServerId) return;
    if (!confirm(`Kick ${member.user.displayName} from the server?`)) return;
    try {
      await api.delete(`/api/servers/${activeServerId}/members/${member.userId}`);
      removeMember(member.userId);
    } catch {
      // kick failed
    }
  };

  const handleBan = async (member: Member) => {
    if (!activeServerId) return;
    if (!confirm(`Ban ${member.user.displayName} from the server? They will not be able to rejoin.`)) return;
    try {
      await api.post(`/api/servers/${activeServerId}/bans/${member.userId}`, { reason: null });
      removeMember(member.userId);
    } catch {
      // ban failed
    }
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { member } = contextMenu;
    return [
      {
        label: `Kick ${member.user.displayName}`,
        icon: <UserMinus size={14} />,
        danger: true,
        onClick: () => handleKick(member),
      },
      {
        label: `Ban ${member.user.displayName}`,
        icon: <ShieldBan size={14} />,
        danger: true,
        onClick: () => handleBan(member),
      },
    ];
  };

  return (
    <>
      <div className="scrollbar-echo w-60 shrink-0 overflow-y-auto bg-ec-bg-secondary px-2 pt-6">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-2">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-ec-text-muted">
              Online — {onlineMembers.length}
            </h3>
            {onlineMembers.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                online
                onClick={() => setProfileUserId(member.userId)}
                onContextMenu={(e) => handleContextMenu(e, member)}
              />
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div className="mb-2">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-ec-text-muted">
              Offline — {offlineMembers.length}
            </h3>
            {offlineMembers.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                online={false}
                onClick={() => setProfileUserId(member.userId)}
                onContextMenu={(e) => handleContextMenu(e, member)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </>
  );
}

function MemberItem({ member, online, onClick, onContextMenu }: { member: Member; online: boolean; onClick: () => void; onContextMenu: (e: MouseEvent) => void }) {
  const roleColor = getRoleColor(member.memberRoles);

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-ec-bg-modifier-hover ${
        !online ? 'opacity-40' : ''
      }`}
    >
      <Avatar
        username={member.user.displayName}
        avatarUrl={member.user.avatarUrl}
        size={32}
        showStatus
        online={online}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={roleColor ? { color: roleColor } : { color: 'var(--ec-text-secondary, #b5bac1)' }}>
          {member.user.displayName}
        </p>
        {member.role !== 'member' && (
          <p className="text-xs text-ec-text-muted capitalize">{member.role}</p>
        )}
      </div>
    </button>
  );
}
