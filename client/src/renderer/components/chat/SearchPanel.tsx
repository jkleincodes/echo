import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useMessageStore } from '../../stores/messageStore';
import { useServerStore } from '../../stores/serverStore';
import Avatar from '../ui/Avatar';

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function SearchPanel({ serverId, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchMessages = useMessageStore((s) => s.searchMessages);
  const clearSearch = useMessageStore((s) => s.clearSearch);
  const searchResults = useMessageStore((s) => s.searchResults);
  const searchLoading = useMessageStore((s) => s.searchLoading);
  const channels = useServerStore((s) => s.channels);
  const setActiveChannel = useServerStore((s) => s.setActiveChannel);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clean up search state on unmount
  useEffect(() => {
    return () => {
      clearSearch();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clearSearch]);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        clearSearch();
        return;
      }

      debounceRef.current = setTimeout(() => {
        searchMessages(serverId, value.trim());
      }, 300);
    },
    [serverId, searchMessages, clearSearch],
  );

  const handleJump = (channelId: string, messageId: string) => {
    setActiveChannel(channelId);
    onClose();
    // Wait for the channel to render then scroll to the message
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`message-${messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-accent/10');
          setTimeout(() => el.classList.remove('bg-accent/10'), 2000);
        }
      }, 300);
    });
  };

  const getChannelName = (channelId: string) => {
    return channels.find((c) => c.id === channelId)?.name ?? 'unknown';
  };

  const panel = (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="flex h-full w-[480px] flex-col bg-ec-bg-secondary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-ec-bg-tertiary px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ec-text-primary">Search</h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search input */}
          <div className="mt-3 flex items-center gap-2 rounded-md bg-ec-bg-tertiary px-3 py-2">
            <Search size={16} className="shrink-0 text-ec-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  clearSearch();
                  inputRef.current?.focus();
                }}
                className="text-ec-text-muted hover:text-ec-text-secondary"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="scrollbar-echo flex-1 overflow-y-auto p-4">
          {searchLoading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}

          {!searchLoading && query.trim() && searchResults.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Search size={40} className="mb-3 text-ec-text-muted" />
              <p className="text-sm text-ec-text-muted">
                No results found for "<span className="text-ec-text-secondary">{query}</span>"
              </p>
            </div>
          )}

          {!searchLoading && !query.trim() && (
            <div className="flex flex-col items-center py-12 text-center">
              <Search size={40} className="mb-3 text-ec-text-muted" />
              <p className="text-sm text-ec-text-muted">
                Start typing to search messages in this server.
              </p>
            </div>
          )}

          {!searchLoading &&
            searchResults.map((message) => (
              <button
                key={message.id}
                onClick={() => handleJump(message.channelId, message.id)}
                className="mb-2 w-full rounded-lg border border-ec-bg-tertiary bg-ec-bg-primary p-3 text-left transition-colors hover:bg-ec-bg-modifier-hover"
              >
                {/* Channel label */}
                <div className="mb-1 text-xs font-medium text-ec-text-muted">
                  #{getChannelName(message.channelId)}
                </div>

                {/* Author row */}
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar
                    username={message.author.displayName}
                    avatarUrl={message.author.avatarUrl}
                    size={20}
                  />
                  <span className="text-sm font-medium text-ec-text-primary">
                    {message.author.displayName}
                  </span>
                  <span className="text-xs text-ec-text-muted">
                    {new Date(message.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Content preview */}
                <p className="line-clamp-2 text-sm text-ec-text-secondary">
                  {message.content}
                </p>
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
