import { useServerStore } from '../stores/serverStore';
import { useAuthStore } from '../stores/authStore';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const members = useServerStore((s) => s.members);
  const servers = useServerStore((s) => s.servers);
  const activeServerId = useServerStore((s) => s.activeServerId);

  const server = servers.find((s) => s.id === activeServerId);
  const member = members.find((m) => m.userId === user?.id);
  const isOwner = server?.ownerId === user?.id;
  const isAdmin = member?.role === 'admin' || member?.role === 'owner';

  return {
    isOwner,
    isAdmin,
    canManageChannels: isAdmin,
    canKickMembers: isAdmin,
    canPinMessages: isAdmin,
  };
}
