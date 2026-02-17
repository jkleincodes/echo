import { useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Hash, Volume2 } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function CreateChannelModal({ serverId, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [loading, setLoading] = useState(false);
  const createChannel = useServerStore((s) => s.createChannel);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createChannel(serverId, name.trim().toLowerCase().replace(/\s+/g, '-'), type);
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
          <h2 className="text-xl font-bold text-ec-text-primary">Create Channel</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel Type
          </label>
          <div className="mb-4 space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${
                type === 'text'
                  ? 'border-ec-text-muted bg-ec-bg-modifier-selected'
                  : 'border-transparent bg-ec-bg-secondary hover:bg-ec-bg-modifier-hover'
              }`}
            >
              <input
                type="radio"
                name="type"
                value="text"
                checked={type === 'text'}
                onChange={() => setType('text')}
                className="hidden"
              />
              <Hash size={24} className="text-ec-text-secondary" />
              <div>
                <p className="font-medium text-ec-text-primary">Text</p>
                <p className="text-xs text-ec-text-muted">Send messages, images, GIFs, and more</p>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${
                type === 'voice'
                  ? 'border-ec-text-muted bg-ec-bg-modifier-selected'
                  : 'border-transparent bg-ec-bg-secondary hover:bg-ec-bg-modifier-hover'
              }`}
            >
              <input
                type="radio"
                name="type"
                value="voice"
                checked={type === 'voice'}
                onChange={() => setType('voice')}
                className="hidden"
              />
              <Volume2 size={24} className="text-ec-text-secondary" />
              <div>
                <p className="font-medium text-ec-text-primary">Voice</p>
                <p className="text-xs text-ec-text-muted">Hang out together with voice</p>
              </div>
            </label>
          </div>

          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel Name
          </label>
          <div className="mb-4 flex items-center gap-2 rounded bg-ec-input-bg px-3">
            {type === 'text' ? (
              <Hash size={16} className="text-ec-text-muted" />
            ) : (
              <Volume2 size={16} className="text-ec-text-muted" />
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              required
              autoFocus
              className="flex-1 bg-transparent py-2.5 text-ec-text-primary outline-none placeholder:text-ec-text-muted"
            />
          </div>

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
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
