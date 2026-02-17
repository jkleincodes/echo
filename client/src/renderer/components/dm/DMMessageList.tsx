import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { socketService } from '../../services/socketService';
import Avatar from '../ui/Avatar';
import FormattedContent from '../chat/FormattedContent';
import type { DMMessage } from '../../../../../shared/types';

const GIPHY_URL_REGEX = /^https?:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\/media\/[^\s]+$/i;

function isGiphyMessage(message: DMMessage): boolean {
  return GIPHY_URL_REGEX.test(message.content.trim());
}

interface Props {
  channelId: string;
}

const EMPTY_MESSAGES: DMMessage[] = [];

export default function DMMessageList({ channelId }: Props) {
  const messages = useDMStore((s) => s.messages.get(channelId) ?? EMPTY_MESSAGES);
  const loading = useDMStore((s) => s.loading.get(channelId) ?? false);
  const cursor = useDMStore((s) => s.cursors.get(channelId));
  const fetchMessages = useDMStore((s) => s.fetchMessages);
  const fetchMore = useDMStore((s) => s.fetchMore);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  // Fetch messages and join socket room on channel change
  useEffect(() => {
    fetchMessages(channelId);

    const socket = socketService.getSocket();
    socket?.emit('dm:join', channelId);

    return () => {
      socket?.emit('dm:leave', channelId);
    };
  }, [channelId, fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Load more on scroll to top
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || loading || !cursor) return;

    if (container.scrollTop < 100) {
      fetchMore(channelId);
    }
  }, [loading, cursor, channelId, fetchMore]);

  // Group messages by author + time proximity
  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.authorId !== curr.authorId) return true;
    const timeDiff =
      new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scrollbar-echo flex-1 overflow-y-auto"
    >
      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      <div className="pb-6 pt-4">
        {messages.map((message, index) => (
          <DMMessageItem
            key={message.id}
            message={message}
            showHeader={shouldShowHeader(index)}
            isOwn={message.authorId === currentUserId}
          />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

interface DMMessageItemProps {
  message: DMMessage;
  showHeader: boolean;
  isOwn: boolean;
}

function DMMessageItem({ message, showHeader, isOwn }: DMMessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editing]);

  const handleDelete = () => {
    const socket = socketService.getSocket();
    socket?.emit('dm:delete', { messageId: message.id });
  };

  const handleEditSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setEditContent(message.content);
      return;
    }
    const socket = socketService.getSocket();
    socket?.emit('dm:edit', { messageId: message.id, content: trimmed }, () => {
      setEditing(false);
    });
  };

  const handleEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setEditContent(message.content);
    }
  };

  const time = new Date(message.createdAt);
  const timeStr = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = time.toLocaleDateString();

  const editedLabel = message.editedAt ? (
    <span className="ml-1 text-[10px] text-ec-text-muted" title={new Date(message.editedAt).toLocaleString()}>
      (edited)
    </span>
  ) : null;

  const gifMessage = isGiphyMessage(message);

  const contentBlock = editing ? (
    <div>
      <textarea
        ref={editRef}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={handleEditKeyDown}
        className="w-full resize-none rounded bg-ec-input-bg p-2 text-ec-text-secondary outline-none"
        rows={Math.min(editContent.split('\n').length + 1, 10)}
        maxLength={2000}
      />
      <p className="mt-1 text-xs text-ec-text-muted">
        escape to <button onClick={() => { setEditing(false); setEditContent(message.content); }} className="text-ec-text-link hover:underline">cancel</button>
        {' '}&bull; enter to <button onClick={handleEditSave} className="text-ec-text-link hover:underline">save</button>
      </p>
    </div>
  ) : gifMessage ? (
    <img
      src={message.content.trim()}
      alt="GIF"
      className="mt-1 max-h-[300px] max-w-[400px] rounded"
      loading="lazy"
    />
  ) : (
    <>
      <FormattedContent content={message.content} />
      {editedLabel}
    </>
  );

  const actionBar = (
    <div className="absolute -top-3 right-4 hidden gap-0.5 rounded border border-ec-bg-modifier-hover bg-ec-bg-primary shadow group-hover:flex">
      {isOwn && (
        <>
          <button
            onClick={() => { setEditing(true); setEditContent(message.content); }}
            className="p-1.5 text-ec-text-muted hover:text-ec-text-secondary"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-ec-text-muted hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );

  if (showHeader) {
    return (
      <div className="group relative mt-4 flex gap-4 px-4 py-0.5 hover:bg-ec-bg-modifier-hover">
        <Avatar
          username={message.author.displayName}
          avatarUrl={message.author.avatarUrl}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-ec-text-primary hover:underline">
              {message.author.displayName}
            </span>
            <span className="text-xs text-ec-text-muted">
              {dateStr} {timeStr}
            </span>
          </div>
          {contentBlock}
        </div>
        {actionBar}
      </div>
    );
  }

  return (
    <div className="group relative flex gap-4 px-4 py-0.5 hover:bg-ec-bg-modifier-hover">
      <div className="w-10 shrink-0">
        <span className="hidden text-[11px] text-ec-text-muted group-hover:inline">
          {timeStr}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {contentBlock}
      </div>
      {actionBar}
    </div>
  );
}
