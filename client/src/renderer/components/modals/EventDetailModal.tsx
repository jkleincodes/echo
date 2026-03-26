import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, MapPin, Hash } from 'lucide-react';
import type { ScheduledEvent, RSVPStatus } from '../../../../../shared/types';
import { useEventStore } from '../../stores/eventStore';
import { useAuthStore } from '../../stores/authStore';
import { useServerStore } from '../../stores/serverStore';
import Avatar from '../ui/Avatar';

interface Props {
  event: ScheduledEvent;
  serverId: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-400',
  active: 'bg-green-500/20 text-green-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' at ' + date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EventDetailModal({ event, serverId, onClose }: Props) {
  const [rsvpLoading, setRsvpLoading] = useState<RSVPStatus | null>(null);
  const setRsvp = useEventStore((s) => s.setRsvp);
  const removeRsvp = useEventStore((s) => s.removeRsvp);
  const currentUser = useAuthStore((s) => s.user);
  const channels = useServerStore((s) => s.channels);

  // Find fresh event data from store in case it was updated by RSVP
  const storeEvent = useEventStore((s) => s.events.find((e) => e.id === event.id)) || event;
  const channel = storeEvent.channelId ? channels.find((c) => c.id === storeEvent.channelId) : null;

  const handleRsvp = async (status: RSVPStatus) => {
    setRsvpLoading(status);
    try {
      if (storeEvent.userRsvp === status) {
        await removeRsvp(serverId, storeEvent.id);
      } else {
        await setRsvp(serverId, storeEvent.id, status);
      }
    } catch {
      // silently fail
    } finally {
      setRsvpLoading(null);
    }
  };

  const rsvpButtons: { status: RSVPStatus; label: string }[] = [
    { status: 'interested', label: 'Interested' },
    { status: 'going', label: 'Going' },
    { status: 'not_going', label: 'Not Going' },
  ];

  const counts = storeEvent.rsvpCounts || { interested: 0, going: 0, not_going: 0 };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[500px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="truncate text-xl font-bold text-ec-text-primary">{storeEvent.title}</h2>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[storeEvent.status] || STATUS_STYLES.scheduled}`}>
                {storeEvent.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {/* Description */}
        {storeEvent.description && (
          <p className="mb-4 whitespace-pre-wrap text-sm text-ec-text-secondary">{storeEvent.description}</p>
        )}

        {/* Info rows */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-ec-text-secondary">
            <Calendar size={16} className="shrink-0 text-ec-text-muted" />
            <span>
              {formatDateTime(storeEvent.startAt)}
              {storeEvent.endAt && ` — ${formatDateTime(storeEvent.endAt)}`}
            </span>
          </div>

          {storeEvent.location && (
            <div className="flex items-center gap-2 text-sm text-ec-text-secondary">
              <MapPin size={16} className="shrink-0 text-ec-text-muted" />
              <span>{storeEvent.location}</span>
            </div>
          )}

          {channel && (
            <div className="flex items-center gap-2 text-sm text-ec-text-secondary">
              <Hash size={16} className="shrink-0 text-ec-text-muted" />
              <span>{channel.name}</span>
            </div>
          )}
        </div>

        {/* Creator */}
        {storeEvent.creator && (
          <div className="mb-5 flex items-center gap-2">
            <span className="text-xs text-ec-text-muted">Created by</span>
            <Avatar
              username={storeEvent.creator.displayName || storeEvent.creator.username}
              avatarUrl={storeEvent.creator.avatarUrl}
              size={20}
            />
            <span className="text-sm font-medium text-ec-text-primary">
              {storeEvent.creator.displayName || storeEvent.creator.username}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="mb-4 border-t border-ec-bg-secondary" />

        {/* RSVP Section */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-ec-text-secondary">RSVP</span>
            <span className="text-xs text-ec-text-muted">
              {counts.interested > 0 && `${counts.interested} interested`}
              {counts.interested > 0 && counts.going > 0 && ' \u00b7 '}
              {counts.going > 0 && `${counts.going} going`}
            </span>
          </div>

          <div className="flex gap-2">
            {rsvpButtons.map(({ status, label }) => {
              const isActive = storeEvent.userRsvp === status;
              return (
                <button
                  key={status}
                  onClick={() => handleRsvp(status)}
                  disabled={rsvpLoading !== null}
                  className={`rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    isActive
                      ? 'bg-accent text-white'
                      : 'bg-ec-bg-floating text-ec-text-secondary hover:bg-ec-bg-secondary hover:text-ec-text-primary'
                  }`}
                >
                  {rsvpLoading === status ? '...' : label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
