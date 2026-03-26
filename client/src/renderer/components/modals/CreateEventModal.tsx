import { useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEventStore } from '../../stores/eventStore';
import { useServerStore } from '../../stores/serverStore';

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function CreateEventModal({ serverId, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [channelId, setChannelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channels = useServerStore((s) => s.channels);
  const createEvent = useEventStore((s) => s.createEvent);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startAt) return;

    setLoading(true);
    setError(null);
    try {
      await createEvent(serverId, {
        title: title.trim(),
        description: description.trim() || null,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        location: location.trim() || null,
        channelId: channelId || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create event');
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[500px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ec-text-primary">Create Event</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            required
            maxLength={200}
            autoFocus
            className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />

          {/* Description */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this event about?"
            maxLength={2000}
            rows={3}
            className="mb-4 w-full resize-none rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />

          {/* Start Date & Time */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Start Date & Time <span className="text-red-400">*</span>
          </label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
            className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
          />

          {/* End Date & Time */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            End Date & Time
          </label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            min={startAt}
            className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
          />

          {/* Location */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where is this happening?"
            maxLength={200}
            className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />

          {/* Channel */}
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel
          </label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mb-6 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">No channel</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.type === 'text' ? '#' : ''} {ch.name}
              </option>
            ))}
          </select>

          {/* Actions */}
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
              disabled={loading || !title.trim() || !startAt}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
