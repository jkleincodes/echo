import { useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { useServerStore } from '../../stores/serverStore';
import type { Channel } from '../../../../../shared/types';

interface Props {
  serverId: string;
  channel: Channel;
  onClose: () => void;
}

export default function EditChannelModal({ serverId, channel, onClose }: Props) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [loading, setLoading] = useState(false);
  const updateChannel = useServerStore((s) => s.updateChannel);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await api.patch(`/api/servers/${serverId}/channels/${channel.id}`, {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        topic: topic.trim() || null,
      });
      updateChannel(res.data.data);
      onClose();
    } catch {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[440px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ec-text-primary">Edit Channel</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="mb-4 w-full rounded bg-ec-input-bg px-3 py-2.5 text-ec-text-primary outline-none placeholder:text-ec-text-muted"
          />

          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Set a topic"
            className="mb-4 w-full rounded bg-ec-input-bg px-3 py-2.5 text-ec-text-primary outline-none placeholder:text-ec-text-muted"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-ec-text-secondary hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
