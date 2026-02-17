import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { socketService } from '../../services/socketService';
import { useAuthStore } from '../../stores/authStore';
import EmojiPicker from './EmojiPicker';
import type { Reaction } from '../../../../../shared/types';

interface Props {
  messageId: string;
  reactions: Reaction[];
  isThreadContext?: boolean;
  threadId?: string | null;
}

export default function ReactionBar({ messageId, reactions, isThreadContext, threadId }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const toggleReaction = (emoji: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    const reaction = reactions.find((r) => r.emoji === emoji);
    if (isThreadContext && threadId) {
      if (reaction && currentUserId && reaction.userIds.includes(currentUserId)) {
        socket.emit('thread:message:unreact', { messageId, emoji });
      } else {
        socket.emit('thread:message:react', { messageId, emoji });
      }
    } else {
      if (reaction && currentUserId && reaction.userIds.includes(currentUserId)) {
        socket.emit('message:unreact', { messageId, emoji });
      } else {
        socket.emit('message:react', { messageId, emoji });
      }
    }
  };

  const handlePickerSelect = (emoji: string) => {
    toggleReaction(emoji);
    setShowPicker(false);
  };

  if (!reactions.length && !showPicker) return null;

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      {reactions.map((r) => {
        const isActive = currentUserId ? r.userIds.includes(currentUserId) : false;
        return (
          <button
            key={r.emoji}
            onClick={() => toggleReaction(r.emoji)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              isActive
                ? 'border-accent bg-accent/20 text-ec-text-primary'
                : 'border-ec-bg-modifier-hover bg-ec-bg-secondary text-ec-text-muted hover:border-ec-text-muted'
            }`}
          >
            <span>{r.emoji}</span>
            <span>{r.count}</span>
          </button>
        );
      })}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center justify-center rounded-full border border-ec-bg-modifier-hover bg-ec-bg-secondary p-1 text-ec-text-muted hover:border-ec-text-muted hover:text-ec-text-secondary"
        >
          <SmilePlus size={14} />
        </button>
        {showPicker && <EmojiPicker onSelect={handlePickerSelect} onClose={() => setShowPicker(false)} direction="up" />}
      </div>
    </div>
  );
}
