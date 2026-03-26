import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import EmojiPicker from '../chat/EmojiPicker';

interface CustomStatusModalProps {
  onClose: () => void;
}

export default function CustomStatusModal({ onClose }: CustomStatusModalProps) {
  const user = useAuthStore((s) => s.user);
  const [emoji, setEmoji] = useState(user?.customStatusEmoji ?? '');
  const [text, setText] = useState(user?.customStatus ?? '');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/api/users/me', {
        customStatus: text || null,
        customStatusEmoji: emoji || null,
      });
      useAuthStore.setState({ user: res.data.data });
      onClose();
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/api/users/me', {
        customStatus: null,
        customStatusEmoji: null,
      });
      useAuthStore.setState({ user: res.data.data });
      onClose();
    } catch {
      // clear failed
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-ec-bg-floating p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ec-text-primary">Set Custom Status</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="relative mb-4 flex items-center gap-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-ec-input-bg text-xl hover:bg-ec-bg-modifier-hover"
            title="Pick an emoji"
          >
            {emoji || '😀'}
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's happening?"
            maxLength={128}
            className="h-10 flex-1 rounded bg-ec-input-bg px-3 text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2">
              <EmojiPicker
                onSelect={(emojiChar: string) => {
                  setEmoji(emojiChar);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button
            onClick={handleClear}
            disabled={saving || (!user?.customStatus && !user?.customStatusEmoji)}
            className="rounded px-4 py-2 text-sm text-ec-text-secondary hover:text-ec-text-primary hover:underline disabled:opacity-40"
          >
            Clear Status
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded bg-ec-bg-tertiary px-4 py-2 text-sm text-ec-text-primary hover:bg-ec-bg-modifier-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-ec-brand px-4 py-2 text-sm font-medium text-white hover:bg-ec-brand/80 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
