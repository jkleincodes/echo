import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Pin } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useServerStore } from '../../stores/serverStore';
import Avatar from '../ui/Avatar';
import type { Message } from '../../../../../shared/types';

interface Props {
  serverId: string;
  channelId: string;
  onClose: () => void;
}

export default function PinnedMessagesPanel({ serverId, channelId, onClose }: Props) {
  const [pins, setPins] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useServerStore((s) => s.members);

  const currentMember = members.find((m) => m.userId === currentUserId);
  const canUnpin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const fetchPins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/servers/${serverId}/channels/${channelId}/pins`);
      setPins(res.data.data);
    } catch (err) {
      console.error('Failed to fetch pinned messages:', err);
    } finally {
      setLoading(false);
    }
  }, [serverId, channelId]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  const handleUnpin = async (messageId: string) => {
    try {
      await api.delete(`/api/servers/${serverId}/channels/${channelId}/pins/${messageId}`);
      setPins((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Failed to unpin message:', err);
    }
  };

  const handleJump = (messageId: string) => {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-accent/10');
      setTimeout(() => el.classList.remove('bg-accent/10'), 2000);
    }
    onClose();
  };

  const panel = (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="flex h-full w-[420px] flex-col bg-ec-bg-secondary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ec-bg-tertiary px-4 py-3">
          <div className="flex items-center gap-2">
            <Pin size={18} className="text-ec-text-muted" />
            <h2 className="font-semibold text-ec-text-primary">Pinned Messages</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="scrollbar-echo flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}

          {!loading && pins.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Pin size={40} className="mb-3 text-ec-text-muted" />
              <p className="text-sm text-ec-text-muted">
                This channel doesn't have any pinned messages... yet.
              </p>
            </div>
          )}

          {!loading &&
            pins.map((message) => (
              <div
                key={message.id}
                className="mb-3 rounded-lg border border-ec-bg-tertiary bg-ec-bg-primary p-3"
              >
                {/* Author row */}
                <div className="mb-2 flex items-center gap-2">
                  <Avatar
                    username={message.author.displayName}
                    avatarUrl={message.author.avatarUrl}
                    size={24}
                  />
                  <span className="text-sm font-medium text-ec-text-primary">
                    {message.author.displayName}
                  </span>
                  <span className="text-xs text-ec-text-muted">
                    {new Date(message.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Content preview */}
                <p className="mb-3 line-clamp-3 text-sm text-ec-text-secondary">
                  {message.content}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleJump(message.id)}
                    className="rounded bg-ec-bg-tertiary px-3 py-1 text-xs font-medium text-ec-text-secondary hover:bg-ec-bg-modifier-hover"
                  >
                    Jump
                  </button>
                  {canUnpin && (
                    <button
                      onClick={() => handleUnpin(message.id)}
                      className="rounded bg-ec-bg-tertiary px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                    >
                      Unpin
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
