import { useState, type MouseEvent } from 'react';
import { UserMinus, ShieldBan } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import Avatar from '../ui/Avatar';
import ContextMenu, { type ContextMenuItem } from '../ui/ContextMenu';
import UserProfileModal from '../modals/UserProfileModal';
import type { Member, Role, UserStatus } from '../../../../../shared/types';

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

const STATUS_ORDER: Record<UserStatus, number> = {
  online: 0,
  idle: 1,
  dnd: 2,
  invisible: 3,
  offline: 3,
};

export default function MemberSidebar() {
  const members = useServerStore((s) => s.members);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const removeMember = useServerStore((s) => s.removeMember);
  const getStatus = usePresenceStore((s) => s.getStatus);
  const userStatuses = usePresenceStore((s) => s.userStatuses); // subscribe to changes
  const { canKickMembers, isOwner } = usePermissions();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<MemberContextMenu | null>(null);

  const onlineMembers = members.filter((m) => getStatus(m.userId) === 'online');
  const idleMembers = members.filter((m) => getStatus(m.userId) === 'idle');
  const dndMembers = members.filter((m) => getStatus(m.userId) === 'dnd');
  const offlineMembers = members.filter((m) => {
    const s = getStatus(m.userId);
    return s === 'offline' || s === 'invisible';
  });

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

  const renderSection = (title: string, sectionMembers: Member[], status: UserStatus) => {
    if (sectionMembers.length === 0) return null;
    return (
      <div className="mb-2">
        <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-ec-text-muted">
          {title} — {sectionMembers.length}
        </h3>
        {sectionMembers.map((member) => (
          <MemberItem
            key={member.id}
            member={member}
            status={status}
            onClick={() => setProfileUserId(member.userId)}
            onContextMenu={(e) => handleContextMenu(e, member)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="scrollbar-echo w-60 shrink-0 overflow-y-auto bg-ec-bg-secondary px-2 pt-6">
        {renderSection('Online', onlineMembers, 'online')}
        {renderSection('Idle', idleMembers, 'idle')}
        {renderSection('Do Not Disturb', dndMembers, 'dnd')}
        {renderSection('Offline', offlineMembers, 'offline')}
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

function MemberItem({ member, status, onClick, onContextMenu }: { member: Member; status: UserStatus; onClick: () => void; onContextMenu: (e: MouseEvent) => void }) {
  const roleColor = getRoleColor(member.memberRoles);
  const isOffline = status === 'offline' || status === 'invisible';

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-ec-bg-modifier-hover ${
        isOffline ? 'opacity-40' : status === 'idle' ? 'opacity-70' : ''
      }`}
    >
      <Avatar
        username={member.user.displayName}
        avatarUrl={member.user.avatarUrl}
        size={32}
        showStatus
        status={status}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={roleColor ? { color: roleColor } : { color: 'var(--ec-text-secondary, #b5bac1)' }}>
          {member.user.displayName}
        </p>
        {(member.user.customStatus || member.user.customStatusEmoji) ? (
          <p className="truncate text-xs text-ec-text-muted">
            {member.user.customStatusEmoji && <span className="mr-0.5">{member.user.customStatusEmoji}</span>}
            {member.user.customStatus}
          </p>
        ) : member.role !== 'member' ? (
          <p className="text-xs text-ec-text-muted capitalize">{member.role}</p>
        ) : null}
      </div>
    </button>
  );
}
