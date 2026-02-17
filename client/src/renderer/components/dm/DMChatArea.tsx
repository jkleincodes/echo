import { useEffect } from 'react';
import { AtSign } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { api } from '../../lib/api';
import Avatar from '../ui/Avatar';
import DMMessageList from './DMMessageList';
import DMMessageInput from './DMMessageInput';

export default function DMChatArea() {
  const activeDMChannelId = useDMStore((s) => s.activeDMChannelId);
  const channels = useDMStore((s) => s.channels);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const clearUnread = useUnreadStore((s) => s.clearUnread);

  // Auto-ack when switching DM channels
  useEffect(() => {
    if (!activeDMChannelId) return;
    clearUnread(activeDMChannelId);
    const timer = setTimeout(() => {
      api.post(`/api/dms/${activeDMChannelId}/ack`).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [activeDMChannelId, clearUnread]);

  if (!activeDMChannelId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-ec-bg-primary">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ec-bg-tertiary">
            <AtSign size={32} className="text-ec-text-muted" />
          </div>
          <p className="text-ec-text-muted">Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  const channel = channels.find((c) => c.id === activeDMChannelId);
  const otherParticipant = channel?.participants.find(
    (p) => p.userId !== currentUserId,
  )?.user;

  if (!channel || !otherParticipant) {
    return (
      <div className="flex flex-1 items-center justify-center bg-ec-bg-primary">
        <p className="text-ec-text-muted">Conversation not found</p>
      </div>
    );
  }

  const isOnline = onlineUsers.has(otherParticipant.id);

  return (
    <div className="flex flex-1 flex-col bg-ec-bg-primary">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-ec-bg-tertiary px-4 shadow-sm">
        <Avatar
          username={otherParticipant.displayName}
          avatarUrl={otherParticipant.avatarUrl}
          size={24}
          showStatus
          online={isOnline}
        />
        <h3 className="font-semibold text-ec-text-primary">
          {otherParticipant.displayName}
        </h3>
      </div>

      {/* Messages */}
      <DMMessageList channelId={activeDMChannelId} />

      {/* Input */}
      <DMMessageInput
        channelId={activeDMChannelId}
        recipientName={otherParticipant.displayName}
      />
    </div>
  );
}
