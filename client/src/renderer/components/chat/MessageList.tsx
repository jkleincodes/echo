import { useEffect, useRef, useCallback } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useServerStore } from '../../stores/serverStore';
import { socketService } from '../../services/socketService';
import MessageItem from './MessageItem';

interface Props {
  channelId: string;
}

const EMPTY_MESSAGES: never[] = [];

export default function MessageList({ channelId }: Props) {
  const messages = useMessageStore((s) => s.messages.get(channelId) ?? EMPTY_MESSAGES);
  const loading = useMessageStore((s) => s.loading.get(channelId) ?? false);
  const cursor = useMessageStore((s) => s.cursors.get(channelId));
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const fetchMore = useMessageStore((s) => s.fetchMore);
  const activeServerId = useServerStore((s) => s.activeServerId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  // Fetch messages on channel change
  useEffect(() => {
    if (activeServerId) {
      fetchMessages(activeServerId, channelId);
    }

    // Join socket room
    const socket = socketService.getSocket();
    console.log('[MessageList] channel:join', channelId, 'socket:', !!socket, 'connected:', socket?.connected);
    socket?.emit('channel:join', channelId);

    return () => {
      socket?.emit('channel:leave', channelId);
    };
  }, [channelId, activeServerId, fetchMessages]);

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
    if (!container || loading || !cursor || !activeServerId) return;

    if (container.scrollTop < 100) {
      fetchMore(activeServerId, channelId);
    }
  }, [loading, cursor, activeServerId, channelId, fetchMore]);

  // Group messages by author + time proximity
  const shouldShowHeader = (index: number) => {
    const curr = messages[index];
    // System messages always standalone
    if (curr.type && curr.type !== 'default') return true;
    if (index === 0) return true;
    const prev = messages[index - 1];
    // Previous was system message
    if (prev.type && prev.type !== 'default') return true;
    if (prev.authorId !== curr.authorId) return true;
    const timeDiff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
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
          <div key={message.id} id={`message-${message.id}`}>
            <MessageItem
              message={message}
              showHeader={shouldShowHeader(index)}
            />
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
