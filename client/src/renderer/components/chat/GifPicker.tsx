import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface GiphyGif {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMore = useRef(false);

  // Position the picker
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const pickerWidth = 420;
    const pickerHeight = 480;
    let left = rect.right - pickerWidth;
    if (left < 0) left = 4;
    let top = rect.top - pickerHeight - 8;
    if (top < 0) top = 4;
    setPos({ top, left });
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!pos) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose, pos]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch GIFs
  const fetchGifs = useCallback(async (searchQuery: string, fetchOffset: number, append: boolean) => {
    if (!append) setLoading(true);
    setError(null);
    loadingMore.current = true;

    try {
      const endpoint = searchQuery
        ? `/api/giphy/search?q=${encodeURIComponent(searchQuery)}&offset=${fetchOffset}&limit=25`
        : `/api/giphy/trending?offset=${fetchOffset}&limit=25`;
      const res = await api.get(endpoint);
      const newGifs: GiphyGif[] = res.data.data;
      const totalCount = res.data.pagination?.total_count ?? Infinity;

      if (append) {
        setGifs((prev) => [...prev, ...newGifs]);
      } else {
        setGifs(newGifs);
        scrollRef.current?.scrollTo(0, 0);
      }
      setOffset(fetchOffset + newGifs.length);
      setHasMore(fetchOffset + newGifs.length < totalCount && newGifs.length > 0);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) {
        setError('GIF integration not configured — set GIPHY_API_KEY on the server');
      } else {
        setError('Failed to load GIFs');
      }
    } finally {
      setLoading(false);
      loadingMore.current = false;
    }
  }, []);

  // Load on mount (trending) and when query changes
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchGifs(debouncedQuery, 0, false);
  }, [debouncedQuery, fetchGifs]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      fetchGifs(debouncedQuery, offset, true);
    }
  }, [debouncedQuery, offset, hasMore, fetchGifs]);

  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {pos &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[9999] flex w-[420px] flex-col overflow-hidden rounded-lg border border-ec-bg-modifier-hover bg-ec-bg-secondary shadow-xl"
            style={{ top: pos.top, left: pos.left, height: 480 }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-ec-bg-modifier-hover px-3 py-2">
              <Search size={16} className="shrink-0 text-ec-text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search GIFs..."
                className="flex-1 bg-transparent text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
                autoFocus
              />
            </div>

            {/* Grid */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-2"
              onScroll={handleScroll}
            >
              {loading && gifs.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-ec-text-muted" />
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center text-sm text-ec-text-muted">
                  {error}
                </div>
              ) : gifs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-ec-text-muted">
                  No GIFs found
                </div>
              ) : (
                <div className="columns-2 gap-1">
                  {gifs.map((gif) => (
                    <button
                      key={gif.id}
                      onClick={() => onSelect(gif.url)}
                      className="mb-1 block w-full overflow-hidden rounded hover:ring-2 hover:ring-accent"
                      title={gif.title}
                    >
                      <img
                        src={gif.previewUrl}
                        alt={gif.title}
                        width={gif.previewWidth}
                        height={gif.previewHeight}
                        className="w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
              {loadingMore.current && gifs.length > 0 && (
                <div className="flex justify-center py-2">
                  <Loader2 size={18} className="animate-spin text-ec-text-muted" />
                </div>
              )}
            </div>

            {/* Attribution */}
            <div className="border-t border-ec-bg-modifier-hover px-3 py-1.5 text-center text-[10px] text-ec-text-muted">
              Powered by GIPHY
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
