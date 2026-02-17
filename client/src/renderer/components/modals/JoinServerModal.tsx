import { useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useServerStore } from '../../stores/serverStore';
import type { InvitePreview } from '../../../../../shared/types';

interface Props {
  onClose: () => void;
}

export default function JoinServerModal({ onClose }: Props) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const setActiveServer = useServerStore((s) => s.setActiveServer);

  const handlePreview = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const res = await api.get(`/api/invites/${code.trim()}`);
      setPreview(res.data.data);
    } catch {
      setError('Invalid or expired invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const res = await api.post(`/api/invites/${code.trim()}/join`);
      const server = res.data.data;
      useServerStore.getState().fetchServers();
      setActiveServer(server.id);
      onClose();
    } catch {
      setError('Failed to join server');
      setJoining(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[440px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ec-text-primary">Join a Server</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {!preview ? (
          <form onSubmit={handlePreview}>
            <p className="mb-4 text-sm text-ec-text-secondary">
              Enter an invite code to join an existing server.
            </p>

            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Invite Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter invite code"
              required
              autoFocus
              className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />

            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

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
                disabled={loading || !code.trim()}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Look Up'
                )}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="mb-4 rounded-md bg-ec-bg-secondary p-4">
              <h3 className="text-lg font-semibold text-ec-text-primary">{preview.serverName}</h3>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-ec-text-muted">
                <Users size={14} />
                <span>{preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}</span>
              </div>
            </div>

            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setPreview(null); setError(''); }}
                className="rounded px-4 py-2 text-sm text-ec-text-secondary hover:underline"
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={joining}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join Server'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
