import { useState, useRef, useEffect } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useThreadStore } from '../../stores/threadStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import { Hash, Pin, Search } from 'lucide-react';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import SearchPanel from './SearchPanel';
import ThreadPanel from './ThreadPanel';
import { api } from '../../lib/api';

export default function ChatArea() {
  const { activeServerId, activeChannelId, channels, members } = useServerStore();
  const updateChannel = useServerStore((s) => s.updateChannel);
  const clearUnread = useUnreadStore((s) => s.clearUnread);
  const activeThread = useThreadStore((s) => s.activeThread);
  const closeThread = useThreadStore((s) => s.closeThread);
  const channel = channels.find((c) => c.id === activeChannelId);

  // Auto-ack when switching channels
  useEffect(() => {
    if (!activeChannelId || !activeServerId) return;
    clearUnread(activeChannelId);
    const timer = setTimeout(() => {
      api.post(`/api/servers/${activeServerId}/channels/${activeChannelId}/ack`).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [activeChannelId, activeServerId, clearUnread]);

  // Close thread panel when switching channels
  useEffect(() => {
    closeThread();
  }, [activeChannelId, closeThread]);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const topicInputRef = useRef<HTMLInputElement>(null);

  if (!channel || channel.type !== 'text') {
    return (
      <div className="flex flex-1 items-center justify-center bg-ec-bg-primary">
        <p className="text-ec-text-muted">Select a text channel to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-ec-bg-primary">
      {/* Channel header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-ec-bg-tertiary px-4 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center">
          <Hash size={20} className="mr-2 shrink-0 text-ec-channel-default" />
          <h3 className="shrink-0 font-semibold text-ec-text-primary">{channel.name}</h3>
          {channel.topic && !editingTopic && (
            <>
              <div className="mx-2 h-5 w-px shrink-0 bg-ec-bg-modifier-active" />
              <span
                className="min-w-0 truncate text-sm text-ec-text-muted cursor-pointer hover:text-ec-text-secondary"
                title={channel.topic}
                onClick={() => {
                  setTopicDraft(channel.topic || '');
                  setEditingTopic(true);
                  setTimeout(() => topicInputRef.current?.focus(), 0);
                }}
              >
                {channel.topic}
              </span>
            </>
          )}
          {!channel.topic && !editingTopic && (
            <button
              className="ml-2 text-xs text-ec-text-muted hover:text-ec-text-secondary"
              onClick={() => {
                setTopicDraft('');
                setEditingTopic(true);
                setTimeout(() => topicInputRef.current?.focus(), 0);
              }}
            >
              Set a topic
            </button>
          )}
          {editingTopic && (
            <input
              ref={topicInputRef}
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  try {
                    const res = await api.patch(
                      `/api/servers/${activeServerId}/channels/${channel.id}`,
                      { topic: topicDraft.trim() || null },
                    );
                    updateChannel(res.data.data);
                  } catch {}
                  setEditingTopic(false);
                }
                if (e.key === 'Escape') {
                  setEditingTopic(false);
                }
              }}
              onBlur={() => setEditingTopic(false)}
              placeholder="Set a channel topic"
              maxLength={1024}
              className="ml-2 flex-1 rounded bg-ec-input-bg px-2 py-0.5 text-sm text-ec-text-primary outline-none"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPins(!showPins)}
            className="rounded p-1.5 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
            title="Pinned Messages"
          >
            <Pin size={20} />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="rounded p-1.5 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
            title="Search"
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      <MessageList channelId={channel.id} />
      <TypingIndicator channelId={channel.id} />
      <MessageInput channelId={channel.id} channelName={channel.name} serverId={activeServerId!} />

      {showPins && activeServerId && (
        <PinnedMessagesPanel
          serverId={activeServerId}
          channelId={channel.id}
          onClose={() => setShowPins(false)}
        />
      )}
      {showSearch && activeServerId && (
        <SearchPanel serverId={activeServerId} onClose={() => setShowSearch(false)} />
      )}
      {activeThread && <ThreadPanel />}
    </div>
  );
}
