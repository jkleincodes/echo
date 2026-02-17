import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Smile } from 'lucide-react';
import { socketService } from '../../services/socketService';
import EmojiPicker from '../chat/EmojiPicker';
import GifPicker from '../chat/GifPicker';

interface Props {
  channelId: string;
  recipientName: string;
}

export default function DMMessageInput({ channelId, recipientName }: Props) {
  const [content, setContent] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingEmit = useRef(0);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Reset content when channel changes
  useEffect(() => {
    setContent('');
  }, [channelId]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmit.current > 3000) {
      const socket = socketService.getSocket();
      socket?.emit('dm:typing-start', { channelId });
      lastTypingEmit.current = now;
    }
  }, [channelId]);

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const socket = socketService.getSocket();
    socket?.emit('dm:send', { channelId, content: trimmed }, () => {});
    setContent('');
    lastTypingEmit.current = 0;
  }, [content, channelId]);

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
    socket?.emit('dm:send', {
      channelId,
      content: url,
    }, () => {});
    setShowGif(false);
  }, [channelId]);

  return (
    <div className="shrink-0 px-4 pb-6">
      <div className="relative flex items-end gap-4 rounded-lg bg-ec-input-bg px-4">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message @${recipientName}`}
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
      </div>
    </div>
  );
}
