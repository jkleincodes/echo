import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { getServerUrl } from '../../lib/serverUrl';

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function InviteModal({ serverId, onClose }: Props) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const generateInvite = async () => {
      try {
        const res = await api.post(`/api/servers/${serverId}/invites`);
        setInviteCode(res.data.data.code);
      } catch {
        setError('Failed to generate invite');
      } finally {
        setLoading(false);
      }
    };
    generateInvite();
  }, [serverId]);

  const inviteLink = `${getServerUrl()}/invite/${inviteCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[440px] rounded-md bg-ec-bg-primary p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ec-text-primary">Invite Friends</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        <p className="mb-4 text-sm text-ec-text-secondary">
          Share this invite link with others to grant access to your server.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={32} className="animate-spin text-ec-text-muted" />
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-red-400">{error}</p>
        ) : (
          <>
            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Invite Link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 overflow-hidden rounded bg-ec-input-bg p-2.5">
                <span className="select-all font-mono text-sm text-ec-text-primary">{inviteLink}</span>
              </div>
              <button
                onClick={handleCopy}
                className="rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
