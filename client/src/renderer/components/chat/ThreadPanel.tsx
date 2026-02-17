import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent, ClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Hash, PlusCircle, Smile, Reply } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { useServerStore } from '../../stores/serverStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useAuthStore } from '../../stores/authStore';
import { useTypingStore } from '../../stores/typingStore';
import { socketService } from '../../services/socketService';
import { api } from '../../lib/api';
import { MAX_FILE_SIZE } from '../../../../../shared/constants';
import Avatar from '../ui/Avatar';
import MessageItem from './MessageItem';
import EmojiPicker from './EmojiPicker';
import TypingIndicator from './TypingIndicator';
import type { Message } from '../../../../../shared/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PendingFile {
  file: File;
  id: string;
}

export default function ThreadPanel() {
  const activeThread = useThreadStore((s) => s.activeThread);
  const closeThread = useThreadStore((s) => s.closeThread);
  const threadMessages = useThreadStore((s) => s.threadMessages);
  const threadLoading = useThreadStore((s) => s.threadLoading);
  const threadCursors = useThreadStore((s) => s.threadCursors);
  const fetchThreadMessages = useThreadStore((s) => s.fetchThreadMessages);
  const fetchMoreThreadMessages = useThreadStore((s) => s.fetchMoreThreadMessages);
  const replyingToInThread = useThreadStore((s) => s.replyingToInThread);
  const setReplyingToInThread = useThreadStore((s) => s.setReplyingToInThread);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const channels = useServerStore((s) => s.channels);
  const clearThreadUnread = useUnreadStore((s) => s.clearThreadUnread);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [content, setContent] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastTypingEmit = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const thread = activeThread;

  // Join/leave thread socket room
  useEffect(() => {
    if (!thread) return;
    const socket = socketService.getSocket();
    socket?.emit('thread:join', thread.id);
    return () => {
      socket?.emit('thread:leave', thread.id);
    };
  }, [thread?.id]);

  // Fetch messages when thread opens
  useEffect(() => {
    if (!thread || !activeServerId) return;
    fetchThreadMessages(activeServerId, thread.id);
  }, [thread?.id, activeServerId, fetchThreadMessages]);

  // Ack thread on open
  useEffect(() => {
    if (!thread || !activeServerId) return;
    clearThreadUnread(thread.id);
    api.post(`/api/servers/${activeServerId}/threads/${thread.id}/ack`).catch(() => {});
  }, [thread?.id, activeServerId, clearThreadUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages, autoScroll]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [content]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);

    // Load more on scroll to top
    if (el.scrollTop < 50 && thread && activeServerId) {
      const cursor = threadCursors.get(thread.id);
      if (cursor && !threadLoading.get(thread.id)) {
        const prevScrollHeight = el.scrollHeight;
        fetchMoreThreadMessages(activeServerId, thread.id).then(() => {
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight - prevScrollHeight;
          });
        });
      }
    }
  }, [thread?.id, activeServerId, threadCursors, threadLoading, fetchMoreThreadMessages]);

  const emitTyping = useCallback(() => {
    if (!thread) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > 3000) {
      const socket = socketService.getSocket();
      socket?.emit('thread:typing:start', { threadId: thread.id });
      lastTypingEmit.current = now;
    }
  }, [thread?.id]);

  const handleSend = useCallback(async () => {
    if (!thread || !activeServerId) return;
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;

    if (files.length > 0) {
      const formData = new FormData();
      if (trimmed) formData.append('content', trimmed);
      if (replyingToInThread) formData.append('replyToId', replyingToInThread.id);
      for (const pf of files) {
        formData.append('files', pf.file);
      }
      try {
        await api.post(
          `/api/servers/${activeServerId}/threads/${thread.id}/messages`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
      } catch (err) {
        console.error('Failed to upload to thread:', err);
      }
      setFiles([]);
      setContent('');
    } else {
      const socket = socketService.getSocket();
      socket?.emit('thread:message:send', {
        threadId: thread.id,
        content: trimmed,
        replyToId: replyingToInThread?.id,
      }, () => {});
      setContent('');
    }
    setReplyingToInThread(null);
    setAutoScroll(true);
  }, [content, files, thread, activeServerId, replyingToInThread, setReplyingToInThread]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    emitTyping();
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).slice(0, 10 - files.length);
    const oversized = arr.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      const names = oversized.map((f) => f.name).join(', ');
      setFileSizeError(`File${oversized.length > 1 ? 's' : ''} too large (max ${formatSize(MAX_FILE_SIZE)}): ${names}`);
      setTimeout(() => setFileSizeError(null), 5000);
    }
    const valid = arr.filter((f) => f.size <= MAX_FILE_SIZE);
    if (valid.length === 0) return;
    const pending = valid.map((f) => ({ file: f, id: crypto.randomUUID() }));
    setFiles((prev) => [...prev, ...pending].slice(0, 10));
  }, [files.length]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  if (!thread) return null;

  const messages = threadMessages.get(thread.id) || [];
  const loading = threadLoading.get(thread.id) ?? false;
  const channel = channels.find((c) => c.id === thread.channelId);

  const panel = (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeThread}>
      <div
        className="flex h-full w-[420px] flex-col bg-ec-bg-secondary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ec-bg-tertiary px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-ec-text-primary">{thread.name}</h2>
            {channel && (
              <div className="flex items-center gap-1 text-xs text-ec-text-muted">
                <Hash size={12} />
                <span>{channel.name}</span>
              </div>
            )}
          </div>
          <button
            onClick={closeThread}
            className="ml-2 rounded p-1 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="scrollbar-echo flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          {loading && messages.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center px-4">
              <p className="text-sm text-ec-text-muted">
                No messages in this thread yet. Start the conversation!
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const showHeader =
              !prev ||
              prev.authorId !== msg.authorId ||
              new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000 ||
              (prev.type && prev.type !== 'default');
            return (
              <MessageItem
                key={msg.id}
                message={msg}
                showHeader={showHeader}
                isThreadContext
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        <TypingIndicator channelId={`thread:${thread.id}`} />

        {/* Reply banner */}
        {replyingToInThread && (
          <div className="flex items-center gap-2 border-t border-ec-bg-tertiary px-3 py-1.5 text-sm">
            <Reply size={14} className="text-ec-text-muted" />
            <span className="text-ec-text-muted">Replying to</span>
            <span className="font-medium text-ec-text-primary">{replyingToInThread.author.displayName}</span>
            <span className="flex-1 truncate text-ec-text-muted">{replyingToInThread.content}</span>
            <button onClick={() => setReplyingToInThread(null)} className="text-ec-text-muted hover:text-ec-text-secondary">
              <X size={16} />
            </button>
          </div>
        )}

        {fileSizeError && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded bg-red-500/20 px-3 py-2 text-sm text-red-400">
            <span>{fileSizeError}</span>
            <button onClick={() => setFileSizeError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <X size={14} />
            </button>
          </div>
        )}

        {files.length > 0 && (
          <div className="mx-4 mb-2 flex flex-wrap gap-2">
            {files.map((pf) => (
              <div
                key={pf.id}
                className="flex items-center gap-2 rounded bg-ec-bg-primary px-3 py-1.5 text-sm text-ec-text-secondary"
              >
                <span className="max-w-[120px] truncate">{pf.file.name}</span>
                <span className="text-xs text-ec-text-muted">{formatSize(pf.file.size)}</span>
                <button onClick={() => removeFile(pf.id)} className="text-ec-text-muted hover:text-ec-text-secondary">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Message input */}
        <div className="shrink-0 border-t border-ec-bg-tertiary px-3 pb-3 pt-2">
          <div className="flex items-end gap-2 rounded-lg bg-ec-input-bg px-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 pb-2 text-ec-text-muted hover:text-ec-text-secondary"
            >
              <PlusCircle size={20} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Reply in thread..."
              maxLength={2000}
              rows={1}
              className="flex-1 resize-none bg-transparent py-2 text-sm text-ec-text-primary outline-none placeholder:text-ec-text-muted"
              style={{ maxHeight: 150 }}
            />
            <div className="relative shrink-0">
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                className="pb-2 text-ec-text-muted hover:text-ec-text-secondary"
              >
                <Smile size={20} />
              </button>
              {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} direction="up" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
