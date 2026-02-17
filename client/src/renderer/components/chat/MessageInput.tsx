import { useState, useRef, useCallback, KeyboardEvent, DragEvent, ClipboardEvent, useEffect } from 'react';
import { PlusCircle, Smile, X, Reply } from 'lucide-react';
import { socketService } from '../../services/socketService';
import { api } from '../../lib/api';
import { useMessageStore } from '../../stores/messageStore';
import { useServerStore } from '../../stores/serverStore';
import { MAX_FILE_SIZE } from '../../../../../shared/constants';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import MentionAutocomplete from './MentionAutocomplete';

interface Props {
  channelId: string;
  channelName: string;
  serverId: string;
}

interface PendingFile {
  file: File;
  id: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageInput({ channelId, channelName, serverId }: Props) {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingEmit = useRef(0);

  const replyingTo = useMessageStore((s) => s.replyingTo);
  const setReplyingTo = useMessageStore((s) => s.setReplyingTo);
  const members = useServerStore((s) => s.members);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Clear reply when channel changes
  useEffect(() => {
    setReplyingTo(null);
  }, [channelId, setReplyingTo]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmit.current > 3000) {
      const socket = socketService.getSocket();
      socket?.emit('typing:start', { channelId });
      lastTypingEmit.current = now;
    }
  }, [channelId]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;

    if (files.length > 0) {
      const formData = new FormData();
      if (trimmed) formData.append('content', trimmed);
      if (replyingTo) formData.append('replyToId', replyingTo.id);
      for (const pf of files) {
        formData.append('files', pf.file);
      }
      try {
        await api.post(
          `/api/servers/${serverId}/channels/${channelId}/messages`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
      } catch (err) {
        console.error('Failed to upload:', err);
      }
      setFiles([]);
      setContent('');
    } else {
      const socket = socketService.getSocket();
      socket?.emit('message:send', {
        channelId,
        content: trimmed,
        replyToId: replyingTo?.id,
      }, () => {});
      setContent('');
    }
    setReplyingTo(null);
  }, [content, files, channelId, serverId, replyingTo, setReplyingTo]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    emitTyping();

    // Check for @mention
    const el = textareaRef.current;
    if (el) {
      const cursorPos = el.selectionStart;
      const textBeforeCursor = val.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
      } else {
        setMentionQuery(null);
      }
    }
  };

  const handleMentionSelect = (username: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const cursorPos = el.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const start = cursorPos - mentionMatch[0].length;
      const newContent = content.slice(0, start) + `@${username} ` + content.slice(cursorPos);
      setContent(newContent);
      setMentionQuery(null);
      requestAnimationFrame(() => {
        const newPos = start + username.length + 2;
        el.selectionStart = el.selectionEnd = newPos;
        el.focus();
      });
    }
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

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setContent((prev) => {
      const el = textareaRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = prev.slice(0, start) + emoji + prev.slice(end);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + emoji.length;
          el.focus();
        });
        return next;
      }
      return prev + emoji;
    });
    setShowEmoji(false);
  };

  const handleGifSelect = useCallback((url: string) => {
    const socket = socketService.getSocket();
    socket?.emit('message:send', {
      channelId,
      content: url,
      replyToId: replyingTo?.id,
    }, () => {});
    setReplyingTo(null);
    setShowGif(false);
  }, [channelId, replyingTo, setReplyingTo]);

  return (
    <div className="shrink-0 px-4 pb-6">
      {/* Reply banner */}
      {replyingTo && (
        <div className="mb-1 flex items-center gap-2 rounded-t bg-ec-bg-secondary px-3 py-1.5 text-sm">
          <Reply size={14} className="text-ec-text-muted" />
          <span className="text-ec-text-muted">Replying to</span>
          <span className="font-medium text-ec-text-primary">{replyingTo.author.displayName}</span>
          <span className="flex-1 truncate text-ec-text-muted">{replyingTo.content}</span>
          <button onClick={() => setReplyingTo(null)} className="text-ec-text-muted hover:text-ec-text-secondary">
            <X size={16} />
          </button>
        </div>
      )}

      {fileSizeError && (
        <div className="mb-2 flex items-center gap-2 rounded bg-red-500/20 px-3 py-2 text-sm text-red-400">
          <span>{fileSizeError}</span>
          <button onClick={() => setFileSizeError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((pf) => (
            <div
              key={pf.id}
              className="flex items-center gap-2 rounded bg-ec-bg-secondary px-3 py-1.5 text-sm text-ec-text-secondary"
            >
              <span className="max-w-[150px] truncate">{pf.file.name}</span>
              <span className="text-xs text-ec-text-muted">{formatSize(pf.file.size)}</span>
              <button onClick={() => removeFile(pf.id)} className="text-ec-text-muted hover:text-ec-text-secondary">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`relative flex items-end gap-4 rounded-lg bg-ec-input-bg px-4 ${
          dragging ? 'ring-2 ring-accent' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 pb-2.5 text-ec-text-muted hover:text-ec-text-secondary"
        >
          <PlusCircle size={24} />
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
          placeholder={`Message #${channelName}`}
          maxLength={2000}
          rows={1}
          className="flex-1 resize-none bg-transparent py-2.5 text-ec-text-primary outline-none placeholder:text-ec-text-muted"
          style={{ maxHeight: 200 }}
        />
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowGif(!showGif); setShowEmoji(false); }}
            className="pb-2.5 text-xs font-bold text-ec-text-muted hover:text-ec-text-secondary"
          >
            GIF
          </button>
          {showGif && <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
            className="pb-2.5 text-ec-text-muted hover:text-ec-text-secondary"
          >
            <Smile size={24} />
          </button>
          {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} direction="up" />}
        </div>

        {/* Mention autocomplete */}
        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            members={members}
            onSelect={handleMentionSelect}
            onClose={() => setMentionQuery(null)}
          />
        )}
      </div>
    </div>
  );
}
