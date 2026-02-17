import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Volume2, Upload, Loader2 } from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboardStore';
import { useServerStore } from '../../stores/serverStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { socketService } from '../../services/socketService';
import { api } from '../../lib/api';
import type { SoundboardSound } from '../../../../../shared/types';

interface Props {
  onClose: () => void;
}

export default function SoundboardPanel({ onClose }: Props) {
  const { sounds, soundboardVolume, fetchSounds, addSound, removeSound, setSoundboardVolume } =
    useSoundboardStore();
  const activeServerId = useServerStore((s) => s.activeServerId);
  const members = useServerStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const connected = useVoiceStore((s) => s.connected);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadEmoji, setUploadEmoji] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = (() => {
    if (!currentUserId || !activeServerId) return false;
    const member = members.find((m) => m.userId === currentUserId && m.serverId === activeServerId);
    return member?.role === 'owner' || member?.role === 'admin';
  })();

  const serverSounds = activeServerId ? sounds[activeServerId] || [] : [];

  useEffect(() => {
    if (activeServerId) {
      fetchSounds(activeServerId);
    }
  }, [activeServerId, fetchSounds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handlePlaySound = useCallback(
    (soundId: string) => {
      if (!connected) return;
      const socket = socketService.getSocket();
      if (!socket) return;
      socket.emit('soundboard:play', { soundId, volume: soundboardVolume }, (result: any) => {
        if (!result.success) {
          setError(result.error || 'Failed to play sound');
          setTimeout(() => setError(''), 3000);
        }
      });
    },
    [connected, soundboardVolume],
  );

  const handleUpload = useCallback(async () => {
    if (!uploadFile || !activeServerId) return;
    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('sound', uploadFile);
    formData.append('name', uploadName || uploadFile.name.replace(/\.[^.]+$/, ''));
    if (uploadEmoji) formData.append('emoji', uploadEmoji);

    try {
      const res = await api.post(`/api/servers/${activeServerId}/soundboard`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addSound(res.data.data);
      setShowUpload(false);
      setUploadFile(null);
      setUploadName('');
      setUploadEmoji('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadName, uploadEmoji, activeServerId, addSound]);

  const handleDeleteSound = useCallback(
    async (sound: SoundboardSound) => {
      try {
        await api.delete(`/api/servers/${sound.serverId}/soundboard/${sound.id}`);
        removeSound(sound.serverId, sound.id);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Delete failed');
        setTimeout(() => setError(''), 3000);
      }
    },
    [removeSound],
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[420px] flex-col rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ec-bg-tertiary px-5 py-3">
          <h2 className="text-base font-bold text-ec-text-primary">Soundboard</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={20} />
          </button>
        </div>

        {/* Volume slider */}
        <div className="flex items-center gap-3 border-b border-ec-bg-tertiary px-5 py-2.5">
          <Volume2 size={16} className="shrink-0 text-ec-text-muted" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={soundboardVolume}
            onChange={(e) => setSoundboardVolume(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ec-bg-tertiary accent-accent"
          />
          <span className="w-8 text-right text-xs text-ec-text-muted">
            {Math.round(soundboardVolume * 100)}%
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-2 text-xs text-red">{error}</div>
        )}

        {/* Sounds grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {serverSounds.length === 0 ? (
            <p className="py-8 text-center text-sm text-ec-text-muted">
              No sounds yet.{isAdmin ? ' Add some!' : ''}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {serverSounds.map((sound) => (
                <div key={sound.id} className="group relative">
                  <button
                    onClick={() => handlePlaySound(sound.id)}
                    disabled={!connected}
                    className="flex w-full flex-col items-center justify-center rounded-md border border-ec-bg-tertiary bg-ec-bg-secondary px-2 py-2.5 transition-colors hover:bg-ec-bg-modifier-hover disabled:cursor-not-allowed disabled:opacity-50"
                    title={connected ? sound.name : 'Join a voice channel to play sounds'}
                  >
                    {sound.emoji && (
                      <span className="mb-1 text-lg">{sound.emoji}</span>
                    )}
                    <span className="max-w-full truncate text-xs text-ec-text-secondary">
                      {sound.name}
                    </span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteSound(sound)}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-ec-bg-primary p-0.5 text-ec-text-muted shadow hover:text-red group-hover:block"
                      title="Delete sound"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin: upload section */}
        {isAdmin && (
          <div className="border-t border-ec-bg-tertiary px-5 py-3">
            {showUpload ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Name"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    className="flex-1 rounded bg-ec-bg-secondary px-2.5 py-1.5 text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
                  />
                  <input
                    type="text"
                    placeholder="Emoji"
                    value={uploadEmoji}
                    onChange={(e) => setUploadEmoji(e.target.value)}
                    maxLength={10}
                    className="w-16 rounded bg-ec-bg-secondary px-2.5 py-1.5 text-center text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded bg-ec-bg-secondary px-3 py-1.5 text-xs text-ec-text-secondary hover:bg-ec-bg-modifier-hover"
                  >
                    <Upload size={12} />
                    {uploadFile ? uploadFile.name : 'Choose file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/ogg,audio/wav,audio/webm,.mp3,.ogg,.wav,.webm"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      setShowUpload(false);
                      setUploadFile(null);
                      setUploadName('');
                      setUploadEmoji('');
                    }}
                    className="rounded px-3 py-1.5 text-xs text-ec-text-muted hover:text-ec-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!uploadFile || uploading}
                    className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploading && <Loader2 size={12} className="animate-spin" />}
                    Upload
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUpload(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-ec-bg-secondary py-1.5 text-xs text-ec-text-secondary hover:bg-ec-bg-modifier-hover"
              >
                <Plus size={14} />
                Add Sound
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
