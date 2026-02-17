import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import type { NotificationLevel, ChannelNotificationLevel } from '../../../../../shared/types';

interface ServerModeProps {
  mode: 'server';
  serverId: string;
  channelId?: undefined;
  onClose: () => void;
}

interface ChannelModeProps {
  mode: 'channel';
  serverId: string;
  channelId: string;
  onClose: () => void;
}

type Props = ServerModeProps | ChannelModeProps;

const MUTE_DURATIONS = [
  { label: '15 minutes', ms: 15 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '8 hours', ms: 8 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: 'Until I turn it back on', ms: 0 },
];

export default function NotificationSettingsModal(props: Props) {
  const { mode, serverId, onClose } = props;
  const channelId = mode === 'channel' ? props.channelId : undefined;

  const store = useNotificationStore();
  const serverPref = store.serverPreferences.get(serverId);
  const channelOverride = channelId ? store.channelOverrides.get(channelId) : undefined;

  const [saving, setSaving] = useState(false);

  // Server-mode state
  const [level, setLevel] = useState<NotificationLevel>(
    (serverPref?.level as NotificationLevel) ?? 'everything',
  );
  const [suppressEveryone, setSuppressEveryone] = useState(serverPref?.suppressEveryone ?? false);
  const [suppressHere, setSuppressHere] = useState(serverPref?.suppressHere ?? false);

  // Channel-mode state
  const [channelLevel, setChannelLevel] = useState<ChannelNotificationLevel>(
    (channelOverride?.level as ChannelNotificationLevel) ?? 'default',
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === 'server') {
        await store.updateServerPreference(serverId, {
          level,
          suppressEveryone,
          suppressHere,
        });
      } else if (channelId) {
        if (channelLevel === 'default') {
          // Remove override if set back to default
          if (channelOverride) {
            await store.removeChannelOverride(serverId, channelId);
          }
        } else {
          await store.updateChannelOverride(serverId, channelId, {
            level: channelLevel,
          });
        }
      }
      onClose();
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  };

  const handleMute = async (durationMs: number) => {
    setSaving(true);
    try {
      const mutedUntil = durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : null;
      if (mode === 'server') {
        await store.updateServerPreference(serverId, { muted: true, mutedUntil });
      } else if (channelId) {
        await store.updateChannelOverride(serverId, channelId, { muted: true, mutedUntil });
      }
      onClose();
    } catch {
      // mute failed
    } finally {
      setSaving(false);
    }
  };

  const handleUnmute = async () => {
    setSaving(true);
    try {
      if (mode === 'server') {
        await store.updateServerPreference(serverId, { muted: false, mutedUntil: null });
      } else if (channelId) {
        await store.updateChannelOverride(serverId, channelId, { muted: false, mutedUntil: null });
      }
      onClose();
    } catch {
      // unmute failed
    } finally {
      setSaving(false);
    }
  };

  const isMuted = mode === 'server'
    ? store.isServerMuted(serverId)
    : channelId ? store.isChannelMuted(channelId) : false;

  const [showMuteDurations, setShowMuteDurations] = useState(false);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[440px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ec-text-primary">
            {mode === 'server' ? 'Server Notification Settings' : 'Channel Notification Settings'}
          </h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {/* Mute Section */}
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase text-ec-text-secondary">Mute</h3>
          {isMuted ? (
            <button
              onClick={handleUnmute}
              disabled={saving}
              className="w-full rounded bg-ec-bg-modifier-hover px-3 py-2 text-left text-sm text-ec-text-primary hover:bg-ec-bg-modifier-selected"
            >
              Unmute {mode === 'server' ? 'Server' : 'Channel'}
            </button>
          ) : showMuteDurations ? (
            <div className="space-y-1">
              {MUTE_DURATIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => handleMute(d.ms)}
                  disabled={saving}
                  className="w-full rounded px-3 py-1.5 text-left text-sm text-ec-text-secondary hover:bg-ec-bg-modifier-hover hover:text-ec-text-primary"
                >
                  {d.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setShowMuteDurations(true)}
              disabled={saving}
              className="w-full rounded bg-ec-bg-modifier-hover px-3 py-2 text-left text-sm text-ec-text-primary hover:bg-ec-bg-modifier-selected"
            >
              Mute {mode === 'server' ? 'Server' : 'Channel'}
            </button>
          )}
        </div>

        {/* Notification Level */}
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase text-ec-text-secondary">Notification Level</h3>
          {mode === 'server' ? (
            <div className="space-y-1.5">
              {(['everything', 'mentions', 'nothing'] as NotificationLevel[]).map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 hover:bg-ec-bg-modifier-hover">
                  <input
                    type="radio"
                    name="level"
                    checked={level === l}
                    onChange={() => setLevel(l)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-ec-text-primary">
                    {l === 'everything' ? 'All Messages' : l === 'mentions' ? '@Mentions Only' : 'Nothing'}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(['default', 'everything', 'mentions', 'nothing'] as ChannelNotificationLevel[]).map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 hover:bg-ec-bg-modifier-hover">
                  <input
                    type="radio"
                    name="channelLevel"
                    checked={channelLevel === l}
                    onChange={() => setChannelLevel(l)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-ec-text-primary">
                    {l === 'default' ? 'Use Server Default' : l === 'everything' ? 'All Messages' : l === 'mentions' ? '@Mentions Only' : 'Nothing'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Suppress @everyone/@here (server mode only) */}
        {mode === 'server' && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-ec-text-secondary">Suppress</h3>
            <label className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 hover:bg-ec-bg-modifier-hover">
              <input
                type="checkbox"
                checked={suppressEveryone}
                onChange={(e) => setSuppressEveryone(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-ec-text-primary">Suppress @everyone</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 hover:bg-ec-bg-modifier-hover">
              <input
                type="checkbox"
                checked={suppressHere}
                onChange={(e) => setSuppressHere(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-ec-text-primary">Suppress @here</span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-ec-text-secondary hover:text-ec-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
