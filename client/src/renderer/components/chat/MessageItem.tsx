import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Pencil, Trash2, SmilePlus, Reply, Pin, ArrowRightToLine, LogOut, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useMessageStore } from '../../stores/messageStore';
import { useServerStore } from '../../stores/serverStore';
import { useThreadStore } from '../../stores/threadStore';
import { usePermissions } from '../../hooks/usePermissions';
import { socketService } from '../../services/socketService';
import { getServerUrl } from '../../lib/serverUrl';
import Avatar from '../ui/Avatar';
import FormattedContent from './FormattedContent';
import AttachmentDisplay from './AttachmentDisplay';
import ReactionBar from './ReactionBar';
import LinkEmbed from './LinkEmbed';
import EmojiPicker from './EmojiPicker';
import type { Message, Role } from '../../../../../shared/types';

const GIPHY_URL_REGEX = /^https?:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\/media\/[^\s]+$/i;

function isGiphyMessage(message: Message): boolean {
  return GIPHY_URL_REGEX.test(message.content.trim()) && (!message.attachments || message.attachments.length === 0);
}

function getRoleColor(memberRoles?: { role: Role }[]): string | undefined {
  if (!memberRoles || memberRoles.length === 0) return undefined;
  const sorted = [...memberRoles].sort((a, b) => b.role.position - a.role.position);
  for (const mr of sorted) {
    if (mr.role.color) return mr.role.color;
  }
  return undefined;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  message: Message;
  showHeader: boolean;
  isThreadContext?: boolean;
}

export default function MessageItem({ message, showHeader, isThreadContext }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwn = message.authorId === currentUserId;
  const setReplyingTo = useMessageStore((s) => s.setReplyingTo);
  const setReplyingToInThread = useThreadStore((s) => s.setReplyingToInThread);
  const openThread = useThreadStore((s) => s.openThread);
  const createThread = useThreadStore((s) => s.createThread);
  const { canPinMessages } = usePermissions();
  const members = useServerStore((s) => s.members);
  const activeServerId = useServerStore((s) => s.activeServerId);

  // Webhook display overrides
  const isWebhook = !!message.webhookId;
  const displayName = message.webhookName || message.author.displayName;
  const displayAvatar = isWebhook ? (message.webhookAvatarUrl || null) : message.author.avatarUrl;

  // Find role color for this message author
  const authorMember = members.find((m) => m.userId === message.authorId);
  const roleColor = isWebhook ? undefined : getRoleColor(authorMember?.memberRoles);

  // System message rendering
  if (message.type && message.type !== 'default') {
    const time = new Date(message.createdAt);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icon = message.type === 'system_join' ? <ArrowRightToLine size={16} className="text-green" /> :
                 message.type === 'system_leave' ? <LogOut size={16} className="text-red" /> :
                 message.type === 'system_pin' ? <Pin size={16} className="text-ec-text-muted" /> :
                 message.type === 'system_thread' ? <MessageSquare size={16} className="text-ec-text-muted" /> : null;
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-1 text-sm text-ec-text-muted">
        {icon}
        <span>{message.content}</span>
        <span className="text-xs">{timeStr}</span>
      </div>
    );
  }

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editing]);

  useEffect(() => {
    if (!showReactionPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionBarRef.current && !actionBarRef.current.contains(e.target as Node)) {
        // Don't close if the click is inside the portaled emoji picker
        const target = e.target as HTMLElement;
        if (target.closest?.('[data-emoji-picker]')) return;
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker]);

  const handleDelete = () => {
    const socket = socketService.getSocket();
    if (isThreadContext && message.threadId) {
      socket?.emit('thread:message:delete', { messageId: message.id });
    } else {
      socket?.emit('message:delete', { messageId: message.id });
    }
  };

  const handleEditSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setEditContent(message.content);
      return;
    }
    const socket = socketService.getSocket();
    if (isThreadContext && message.threadId) {
      socket?.emit('thread:message:edit', { messageId: message.id, content: trimmed }, () => {
        setEditing(false);
      });
    } else {
      socket?.emit('message:edit', { messageId: message.id, content: trimmed }, () => {
        setEditing(false);
      });
    }
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

  const handleReactionPick = (emoji: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    const existing = message.reactions.find((r) => r.emoji === emoji);
    if (isThreadContext && message.threadId) {
      if (existing && currentUserId && existing.userIds.includes(currentUserId)) {
        socket.emit('thread:message:unreact', { messageId: message.id, emoji });
      } else {
        socket.emit('thread:message:react', { messageId: message.id, emoji });
      }
    } else {
      if (existing && currentUserId && existing.userIds.includes(currentUserId)) {
        socket.emit('message:unreact', { messageId: message.id, emoji });
      } else {
        socket.emit('message:react', { messageId: message.id, emoji });
      }
    }
    setShowReactionPicker(false);
  };

  const handleReply = () => {
    if (isThreadContext) {
      setReplyingToInThread(message);
    } else {
      setReplyingTo(message);
    }
  };

  const handleCreateThread = async () => {
    if (!activeServerId) return;
    const name = message.content.slice(0, 50).trim() || 'New Thread';
    await createThread(activeServerId, message.channelId, message.id, name);
  };

  const handleOpenThread = () => {
    if (!message.thread) return;
    // Fetch full thread details and open
    import('../../lib/api').then(({ api }) => {
      const serverId = useServerStore.getState().activeServerId;
      if (!serverId) return;
      api.get(`/api/servers/${serverId}/threads/${message.thread!.id}`).then((res) => {
        openThread(res.data.data);
      }).catch(() => {});
    });
  };

  const time = new Date(message.createdAt);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString();

  const editedLabel = message.editedAt ? (
    <span className="ml-1 text-[10px] text-ec-text-muted" title={new Date(message.editedAt).toLocaleString()}>
      (edited)
    </span>
  ) : null;

  // Reply preview
  const replyPreview = message.replyTo ? (
    <div className="mb-0.5 flex items-center gap-1.5 text-xs text-ec-text-muted">
      <Reply size={12} />
      <span className="font-medium text-ec-text-secondary">{message.replyTo.author.displayName}</span>
      <span className="truncate">{message.replyTo.content}</span>
    </div>
  ) : null;

  // Pin indicator
  const pinIndicator = message.pinnedAt ? (
    <div className="mb-0.5 flex items-center gap-1 text-[10px] text-ec-text-muted">
      <Pin size={10} />
      <span>Pinned</span>
    </div>
  ) : null;

  // Thread indicator
  const threadIndicator = !isThreadContext && message.thread ? (
    <button
      onClick={handleOpenThread}
      className="mt-1 flex items-center gap-2 rounded bg-ec-bg-secondary px-3 py-1.5 text-xs hover:bg-ec-bg-modifier-hover"
    >
      <MessageSquare size={14} className="text-accent" />
      <span className="font-medium text-accent">
        {message.thread.messageCount} {message.thread.messageCount === 1 ? 'reply' : 'replies'}
      </span>
      <span className="text-ec-text-muted">
        Last reply {formatRelativeTime(message.thread.lastActivityAt)}
      </span>
      {message.thread.participantAvatars.length > 0 && (
        <div className="flex -space-x-1">
          {message.thread.participantAvatars.slice(0, 3).map((avatar, i) => (
            <div key={i} className="h-4 w-4 rounded-full border border-ec-bg-secondary bg-ec-bg-tertiary overflow-hidden">
              {avatar ? (
                <img src={avatar.startsWith('http') ? avatar : `${getServerUrl()}${avatar}`} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-ec-bg-modifier-active" />
              )}
            </div>
          ))}
        </div>
      )}
    </button>
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
      <FormattedContent content={message.content} mentions={message.mentions} />
      {editedLabel}
    </>
  );

  const actionBar = (
    <div ref={actionBarRef} className={`absolute -top-3 right-4 gap-0.5 rounded border border-ec-bg-modifier-hover bg-ec-bg-primary shadow ${showReactionPicker ? 'flex' : 'hidden group-hover:flex'}`}>
      <button
        onClick={() => setShowReactionPicker(!showReactionPicker)}
        className="p-1.5 text-ec-text-muted hover:text-ec-text-secondary"
        title="Add Reaction"
      >
        <SmilePlus size={16} />
      </button>
      <button
        onClick={handleReply}
        className="p-1.5 text-ec-text-muted hover:text-ec-text-secondary"
        title="Reply"
      >
        <Reply size={16} />
      </button>
      {!isThreadContext && !message.thread && message.type === 'default' && (
        <button
          onClick={handleCreateThread}
          className="p-1.5 text-ec-text-muted hover:text-ec-text-secondary"
          title="Create Thread"
        >
          <MessageSquare size={16} />
        </button>
      )}
      {!isThreadContext && canPinMessages && !message.pinnedAt && (
        <button
          onClick={async () => {
            try {
              const { api } = await import('../../lib/api');
              const { useServerStore } = await import('../../stores/serverStore');
              const serverId = useServerStore.getState().activeServerId;
              if (serverId) {
                await api.post(`/api/servers/${serverId}/channels/${message.channelId}/pins/${message.id}`);
              }
            } catch {}
          }}
          className="p-1.5 text-ec-text-muted hover:text-ec-text-secondary"
          title="Pin Message"
        >
          <Pin size={16} />
        </button>
      )}
      {isOwn && !isWebhook && (
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
      {showReactionPicker && <EmojiPicker onSelect={handleReactionPick} onClose={() => setShowReactionPicker(false)} />}
    </div>
  );

  const extras = (
    <>
      <AttachmentDisplay attachments={message.attachments} />
      {!gifMessage && message.embeds.map((embed) => (
        <LinkEmbed key={embed.id} embed={embed} />
      ))}
      <ReactionBar messageId={message.id} reactions={message.reactions} isThreadContext={isThreadContext} threadId={message.threadId} />
      {threadIndicator}
    </>
  );

  if (showHeader) {
    return (
      <div id={`message-${message.id}`} className="group relative mt-4 flex gap-4 px-4 py-0.5 hover:bg-ec-bg-modifier-hover">
        <Avatar username={displayName} avatarUrl={displayAvatar} size={40} />
        <div className="min-w-0 flex-1">
          {pinIndicator}
          {replyPreview}
          <div className="flex items-baseline gap-2">
            <span className="font-medium hover:underline" style={roleColor ? { color: roleColor } : undefined}>
              {displayName}
            </span>
            {isWebhook && (
              <span className="rounded bg-accent/80 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                BOT
              </span>
            )}
            <span className="text-xs text-ec-text-muted">
              {dateStr} {timeStr}
            </span>
          </div>
          {contentBlock}
          {extras}
        </div>
        {actionBar}
      </div>
    );
  }

  return (
    <div id={`message-${message.id}`} className="group relative flex gap-4 px-4 py-0.5 hover:bg-ec-bg-modifier-hover">
      <div className="w-10 shrink-0">
        <span className="hidden whitespace-nowrap text-[9px] leading-5 text-ec-text-muted group-hover:inline">{timeStr}</span>
      </div>
      <div className="min-w-0 flex-1">
        {pinIndicator}
        {replyPreview}
        {contentBlock}
        {extras}
      </div>
      {actionBar}
    </div>
  );
}
