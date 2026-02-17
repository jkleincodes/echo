import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Monitor, Loader2, Volume2, VolumeOff, ShieldAlert } from 'lucide-react';
import type { ScreenShareQuality } from '../../services/voiceService';

interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId: string;
}

interface Props {
  onSelect: (quality: ScreenShareQuality, audio: boolean) => void;
  onClose: () => void;
}

export default function ScreenSharePicker({ onSelect, onClose }: Props) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quality, setQuality] = useState<ScreenShareQuality>('hd');
  const [audio, setAudio] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (window as any).electronAPI?.getScreenSources?.().then((result: ScreenSource[] | { error: string }) => {
      if (cancelled) return;
      if (result && 'error' in result && result.error === 'screen-permission-denied') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }
      const sources = result as ScreenSource[];
      setSources(sources);
      if (sources.length > 0) setSelectedId(sources[0].id);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleShare = useCallback(async () => {
    if (!selectedId) return;
    await (window as any).electronAPI?.selectScreenSource?.(selectedId);
    onSelect(quality, audio);
  }, [selectedId, quality, audio, onSelect]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[640px] flex-col rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ec-bg-tertiary px-6 py-4">
          <h2 className="text-lg font-bold text-ec-text-primary">Share Your Screen</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-ec-text-muted" />
            </div>
          ) : permissionDenied ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <ShieldAlert size={40} className="text-ec-text-muted" />
              <div className="text-center">
                <p className="mb-1 text-sm font-medium text-ec-text-primary">Screen Recording Permission Required</p>
                <p className="mb-4 text-xs text-ec-text-muted">
                  Echo needs Screen Recording permission to share your screen.<br />
                  Grant access in System Settings, then restart the app.
                </p>
                <button
                  onClick={() => (window as any).electronAPI?.openExternal?.('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')}
                  className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
                >
                  Open System Settings
                </button>
              </div>
            </div>
          ) : sources.length === 0 ? (
            <p className="py-8 text-center text-sm text-ec-text-muted">No sources available</p>
          ) : (
            <>
              {screens.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-bold uppercase text-ec-text-secondary">Screens</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {screens.map((source) => (
                      <SourceTile
                        key={source.id}
                        source={source}
                        selected={selectedId === source.id}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </div>
                </div>
              )}
              {windows.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase text-ec-text-secondary">Windows</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {windows.map((source) => (
                      <SourceTile
                        key={source.id}
                        source={source}
                        selected={selectedId === source.id}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ec-bg-tertiary px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-md bg-ec-bg-secondary p-1">
              <button
                onClick={() => setQuality('sd')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${quality === 'sd' ? 'bg-ec-bg-modifier-hover text-ec-text-primary' : 'text-ec-text-muted hover:text-ec-text-secondary'}`}
              >
                720p 60fps
              </button>
              <button
                onClick={() => setQuality('hd')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${quality === 'hd' ? 'bg-ec-bg-modifier-hover text-ec-text-primary' : 'text-ec-text-muted hover:text-ec-text-secondary'}`}
              >
                1080p 60fps
              </button>
            </div>
            <button
              onClick={() => setAudio(!audio)}
              title={audio ? 'System audio enabled (captures all sounds)' : 'System audio disabled'}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${audio ? 'bg-ec-bg-secondary text-ec-text-primary' : 'bg-ec-bg-secondary text-ec-text-muted'}`}
            >
              {audio ? <Volume2 size={14} /> : <VolumeOff size={14} />}
              Audio
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded px-4 py-2 text-sm font-medium text-ec-text-secondary hover:text-ec-text-primary hover:underline"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedId}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SourceTile({ source, selected, onSelect }: { source: ScreenSource; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(source.id)}
      className={`group flex flex-col overflow-hidden rounded-lg border-2 transition-colors ${selected ? 'border-accent' : 'border-transparent hover:border-ec-bg-modifier-hover'}`}
    >
      <div className="aspect-video w-full overflow-hidden bg-black">
        <img
          src={source.thumbnailDataUrl}
          alt={source.name}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
      <div className="flex items-center gap-2 bg-ec-bg-secondary px-2 py-1.5">
        <Monitor size={12} className="shrink-0 text-ec-text-muted" />
        <span className="truncate text-xs text-ec-text-secondary">{source.name}</span>
      </div>
    </button>
  );
}
