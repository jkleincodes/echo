import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface InvitePreview {
  code: string;
  serverName: string;
  memberCount: number;
}

export default function InviteAcceptPage() {
  const { code } = useParams<{ code: string }>();
  const user = useAuthStore((s) => s.user);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await api.get(`/api/invites/${code}`);
        setPreview(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Invalid invite');
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      await api.post(`/api/invites/${code}/join`);
      setJoined(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-ec-text-muted" />
      </div>
    );
  }

  if (!preview && error) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg bg-ec-bg-primary p-8 text-center shadow-lg">
          <AlertCircle size={48} className="mx-auto mb-4 text-red" />
          <h2 className="mb-2 text-xl font-semibold text-ec-text-primary">Invalid Invite</h2>
          <p className="text-ec-text-secondary">{error}</p>
          <Link
            to="/"
            className="mt-6 inline-block rounded bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent-dark"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg bg-ec-bg-primary p-8 text-center shadow-lg">
          <CheckCircle size={48} className="mx-auto mb-4 text-green" />
          <h2 className="mb-2 text-xl font-semibold text-ec-text-primary">
            You joined {preview?.serverName}!
          </h2>
          <p className="mb-6 text-ec-text-secondary">
            Open Echo to start chatting.
          </p>
          <div className="flex flex-col items-center gap-3">
            <a
              href={`echo://invite/${code}`}
              className="flex items-center gap-2 rounded bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
            >
              <Download size={18} />
              Open in Echo
            </a>
            <Link to="/" className="text-sm text-ec-text-link hover:underline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-ec-bg-primary p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
          <Users size={32} className="text-accent" />
        </div>

        <p className="mb-1 text-sm text-ec-text-muted">You've been invited to join</p>
        <h2 className="mb-2 text-2xl font-bold text-ec-text-primary">
          {preview?.serverName}
        </h2>
        <p className="mb-6 text-sm text-ec-text-secondary">
          {preview?.memberCount} {preview?.memberCount === 1 ? 'member' : 'members'}
        </p>

        {error && (
          <div className="mb-4 rounded bg-red/10 p-3 text-sm text-red">{error}</div>
        )}

        {user ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Accept Invite'}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <a
              href={`echo://invite/${code}`}
              className="flex w-full items-center justify-center gap-2 rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark"
            >
              <Download size={18} />
              Open in Echo
            </a>
            <Link
              to={`/login?redirect=${encodeURIComponent(`/invite/${code}`)}`}
              className="w-full rounded bg-ec-bg-secondary p-2.5 text-center text-sm font-medium text-ec-text-secondary transition-colors hover:bg-ec-bg-modifier-hover"
            >
              Log in to join via browser
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
