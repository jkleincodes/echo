import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useDMStore } from '../../stores/dmStore';
import { useServerStore } from '../../stores/serverStore';
import Avatar from '../ui/Avatar';
import type { User, Server } from '../../../../../shared/types';
import { getServerUrl } from '../../lib/serverUrl';

interface ProfileData extends User {
  createdAt: string;
  mutualServers?: Server[];
}

interface Props {
  userId: string;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dmLoading, setDmLoading] = useState(false);

  const createOrGetChannel = useDMStore((s) => s.createOrGetChannel);
  const setActiveDMChannel = useDMStore((s) => s.setActiveDMChannel);
  const setShowHome = useServerStore((s) => s.setShowHome);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get(`/api/users/${userId}`);
        setProfile(res.data.data);
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  const handleMessage = async () => {
    if (!profile) return;
    setDmLoading(true);
    try {
      const channel = await createOrGetChannel(userId);
      setActiveDMChannel(channel.id);
      setShowHome(true);
      onClose();
    } catch {
      setDmLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[600px] overflow-hidden rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-ec-text-muted" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
                <X size={24} />
              </button>
            </div>
          </div>
        ) : profile ? (
          <>
            {/* Banner */}
            <div
              className="relative h-[120px] bg-cover bg-center"
              style={
                profile.bannerUrl
                  ? { backgroundImage: `url(${profile.bannerUrl.startsWith('http') ? profile.bannerUrl : getServerUrl() + profile.bannerUrl})` }
                  : { backgroundColor: profile.bannerColor || '#0ea5e9' }
              }
            >
              <button
                onClick={onClose}
                className="absolute right-3 top-3 rounded-full bg-black/40 p-1 text-white hover:bg-black/60"
              >
                <X size={20} />
              </button>
            </div>

            {/* Avatar + actions */}
            <div className="relative px-4">
              <div className="absolute -top-[40px]">
                <div className="rounded-full border-[6px] border-ec-bg-primary">
                  <Avatar
                    username={profile.username}
                    avatarUrl={profile.avatarUrl}
                    size={80}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  onClick={handleMessage}
                  disabled={dmLoading}
                  className="flex items-center gap-1.5 rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  <MessageSquare size={16} />
                  {dmLoading ? 'Opening...' : 'Message'}
                </button>
              </div>
            </div>

            {/* Profile info */}
            <div className="px-4 pb-4">
              <div className="mt-2 rounded-md bg-ec-bg-secondary p-4">
                <h2 className="text-xl font-bold text-ec-text-primary">{profile.displayName}</h2>
                <p className="text-sm text-ec-text-secondary">{profile.username}</p>
                {profile.pronouns && (
                  <p className="text-xs text-ec-text-muted">{profile.pronouns}</p>
                )}

                {profile.customStatus && (
                  <p className="mt-2 text-sm text-ec-text-primary">{profile.customStatus}</p>
                )}

                <div className="my-3 h-px bg-ec-bg-tertiary" />

                {profile.bio && (
                  <>
                    <h3 className="mb-1 text-xs font-bold uppercase text-ec-text-secondary">About Me</h3>
                    <p className="mb-3 whitespace-pre-wrap text-sm text-ec-text-primary">{profile.bio}</p>
                  </>
                )}

                <h3 className="mb-1 text-xs font-bold uppercase text-ec-text-secondary">Member Since</h3>
                <p className="text-sm text-ec-text-primary">
                  {new Date(profile.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>

                {profile.mutualServers && profile.mutualServers.length > 0 && (
                  <>
                    <div className="my-3 h-px bg-ec-bg-tertiary" />
                    <h3 className="mb-2 text-xs font-bold uppercase text-ec-text-secondary">
                      Mutual Servers — {profile.mutualServers.length}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.mutualServers.map((server) => (
                        <div
                          key={server.id}
                          className="flex items-center gap-2 rounded bg-ec-bg-tertiary px-2 py-1"
                        >
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                            {server.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-ec-text-primary">{server.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
