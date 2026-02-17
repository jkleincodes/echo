import { useEffect } from 'react';
import { Plus, Users } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useServerStore } from '../../stores/serverStore';
import { useUnreadStore } from '../../stores/unreadStore';
import Avatar from '../ui/Avatar';
import UserPanel from '../layout/UserPanel';
import type { DMChannel } from '../../../../../shared/types';

export default function DMSidebar() {
  const { channels, activeDMChannelId, setActiveDMChannel, fetchChannels } = useDMStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const setShowHome = useServerStore((s) => s.setShowHome);
  const unreads = useUnreadStore((s) => s.unreads);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const getOtherParticipant = (channel: DMChannel) => {
    return channel.participants.find((p) => p.userId !== currentUserId)?.user;
  };

  const handleChannelClick = (channelId: string) => {
    setActiveDMChannel(channelId);
  };

  const handleFriendsClick = () => {
    setActiveDMChannel(null);
  };

  return (
    <div className="flex w-60 shrink-0 flex-col bg-ec-bg-secondary">
      {/* Header */}
      <div className="titlebar-drag flex h-12 items-center border-b border-ec-bg-tertiary px-4">
        <input
          type="text"
          placeholder="Find or start a conversation"
          className="titlebar-no-drag h-7 w-full rounded bg-ec-bg-tertiary px-2 text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
          readOnly
        />
      </div>

      <div className="scrollbar-echo flex-1 overflow-y-auto px-2 pt-3">
        {/* Friends button */}
        <button
          onClick={handleFriendsClick}
          className={`mb-1 flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
            !activeDMChannelId
              ? 'bg-ec-bg-modifier-selected text-ec-interactive-active'
              : 'text-ec-channel-default hover:bg-ec-bg-modifier-hover hover:text-ec-interactive-hover'
          }`}
        >
          <Users size={24} />
          <span className="text-sm font-medium">Friends</span>
        </button>

        {/* DM header */}
        <div className="flex items-center justify-between px-1 pb-1 pt-4">
          <span className="text-xs font-semibold uppercase text-ec-text-muted">
            Direct Messages
          </span>
          <button
            className="text-ec-text-muted hover:text-ec-text-secondary"
            title="Create DM"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Channel list */}
        <div className="space-y-0.5">
          {channels.map((channel) => {
            const otherUser = getOtherParticipant(channel);
            if (!otherUser) return null;

            const isActive = channel.id === activeDMChannelId;
            const isOnline = onlineUsers.has(otherUser.id);
            const unread = unreads.get(channel.id);
            const hasUnread = unread && unread.count > 0;

            return (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel.id)}
                className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors ${
                  isActive
                    ? 'bg-ec-bg-modifier-selected text-ec-interactive-active'
                    : hasUnread
                      ? 'text-ec-text-primary hover:bg-ec-bg-modifier-hover'
                      : 'text-ec-channel-default hover:bg-ec-bg-modifier-hover hover:text-ec-interactive-hover'
                }`}
              >
                <Avatar
                  username={otherUser.displayName}
                  avatarUrl={otherUser.avatarUrl}
                  size={32}
                  showStatus
                  online={isOnline}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${hasUnread && !isActive ? 'font-bold' : 'font-medium'}`}>{otherUser.displayName}</p>
                  {channel.lastMessage && (
                    <p className="truncate text-xs text-ec-text-muted">
                      {channel.lastMessage.content}
                    </p>
                  )}
                </div>
                {hasUnread && !isActive && (
                  <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {unread.count > 99 ? '99+' : unread.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <UserPanel />
    </div>
  );
}
