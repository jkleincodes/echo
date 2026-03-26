import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useServerStore } from '../../stores/serverStore';
import { getServerUrl } from '../../lib/serverUrl';

interface PublicServer {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  memberCount: number;
}

const COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#009688', '#4caf50', '#ff9800', '#ff5722',
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function resolveUrl(url: string) {
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return getServerUrl() + url;
}

interface Props {
  onClose: () => void;
}

const PAGE_SIZE = 12;

export default function DiscoverModal({ onClose }: Props) {
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchServers = useCallback(async (query: string, pageNum: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/servers/discover', {
        params: { search: query || undefined, page: pageNum, limit: PAGE_SIZE },
      });
      const data: PublicServer[] = res.data.data;
      setServers((prev) => (append ? [...prev, ...data] : data));
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setError('Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers('', 1, false);
  }, [fetchServers]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchServers(value, 1, false);
    }, 300);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchServers(search, nextPage, true);
  };

  const handleJoin = async (serverId: string) => {
    setJoiningId(serverId);
    try {
      await api.post(`/api/servers/${serverId}/join`);
    } catch (err: any) {
      if (err.response?.status !== 409) {
        setJoiningId(null);
        return;
      }
      // 409 = already a member, just navigate
    }
    await useServerStore.getState().fetchServers();
    useServerStore.getState().setActiveServer(serverId);
    useServerStore.getState().setShowHome(false);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex w-[700px] max-h-[80vh] flex-col rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-xl font-bold text-ec-text-primary">Discover Servers</h2>
          <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ec-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search servers..."
              autoFocus
              className="w-full rounded bg-ec-input-bg py-2.5 pl-10 pr-3 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && !loading && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}

          {!error && servers.length === 0 && !loading && (
            <p className="text-center text-sm text-ec-text-muted">No servers found</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex flex-col rounded-lg bg-ec-bg-floating p-4 transition-colors hover:bg-ec-bg-secondary"
              >
                <div className="mb-3 flex items-center gap-3">
                  {server.iconUrl ? (
                    <img
                      src={resolveUrl(server.iconUrl)}
                      alt={server.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white"
                      style={{ backgroundColor: getColor(server.name) }}
                    >
                      {server.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-ec-text-primary">{server.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-ec-text-muted">
                      <Users size={12} />
                      <span>{server.memberCount} {server.memberCount === 1 ? 'member' : 'members'}</span>
                    </div>
                  </div>
                </div>

                {server.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-ec-text-secondary">
                    {server.description}
                  </p>
                )}

                <div className="mt-auto">
                  <button
                    onClick={() => handleJoin(server.id)}
                    disabled={joiningId === server.id}
                    className="w-full rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                  >
                    {joiningId === server.id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-ec-text-muted" />
            </div>
          )}

          {!loading && hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                className="rounded bg-ec-bg-floating px-4 py-2 text-sm text-ec-text-secondary hover:bg-ec-bg-secondary hover:text-ec-text-primary"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
