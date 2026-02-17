import { useState, useRef, useCallback, useEffect, type DragEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { Hash, Volume2, ChevronDown, ChevronRight, Plus, Settings, UserPlus, FolderPlus, MicOff, HeadphoneOff, Pencil, Trash2, Video, Monitor, UserMinus, ShieldBan, BellOff, Bell } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { useVoice } from '../../hooks/useVoice';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { usePermissions } from '../../hooks/usePermissions';
import { socketService } from '../../services/socketService';
import { api } from '../../lib/api';
import Avatar from '../ui/Avatar';
import ContextMenu, { type ContextMenuItem } from '../ui/ContextMenu';
import UserPanel from './UserPanel';
import CreateChannelModal from '../modals/CreateChannelModal';
import CreateCategoryModal from '../modals/CreateCategoryModal';
import EditChannelModal from '../modals/EditChannelModal';
import InviteModal from '../modals/InviteModal';
import ServerSettingsModal from '../modals/ServerSettingsModal';
import NotificationSettingsModal from '../modals/NotificationSettingsModal';
import { useNotificationStore } from '../../stores/notificationStore';
import type { Channel, ChannelCategory } from '../../../../../shared/types';

interface DropTarget {
  categoryId: string | null; // null = uncategorized
  index: number; // position within the category's channel list
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'category' | 'channel' | 'user';
  id: string;
}

export default function ChannelSidebar() {
  const { channels, categories, activeServerId, activeChannelId, setActiveChannel, servers, members, reorderChannels, deleteCategory, deleteChannel, updateCategory } = useServerStore();
  const { joinVoice } = useVoice();
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const channelParticipants = useVoiceStore((s) => s.channelParticipants);
  const speaking = useVoiceStore((s) => s.speaking);
  const userVoiceStates = useVoiceStore((s) => s.userVoiceStates);
  const userMediaStates = useVoiceStore((s) => s.userMediaStates);
  const unreads = useUnreadStore((s) => s.unreads);
  const { isAdmin, isOwner, canManageChannels, canKickMembers } = usePermissions();
  const notificationStore = useNotificationStore();

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showServerNotifModal, setShowServerNotifModal] = useState(false);
  const [notifChannelId, setNotifChannelId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Inline category rename state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const categoryInputRef = useRef<HTMLInputElement>(null);

  // Edit channel modal state
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  // Drag-and-drop state (channels)
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragCounterRef = useRef(0);

  // Drag-and-drop state (users)
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const draggedUserIdRef = useRef<string | null>(null);
  const [userDropTargetChannelId, setUserDropTargetChannelId] = useState<string | null>(null);

  const server = servers.find((s) => s.id === activeServerId);

  // Focus the category rename input when editing starts
  useEffect(() => {
    if (editingCategoryId && categoryInputRef.current) {
      categoryInputRef.current.focus();
      categoryInputRef.current.select();
    }
  }, [editingCategoryId]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleChannelClick = (channelId: string, type: string) => {
    if (type === 'text') {
      setActiveChannel(channelId);
    } else {
      joinVoice(channelId).catch(console.error);
    }
  };

  // Helper: get sorted channels for a given categoryId
  const getChannelsForCategory = useCallback((categoryId: string | null) => {
    return channels
      .filter((c) => (categoryId === null ? !c.categoryId : c.categoryId === categoryId))
      .sort((a, b) => a.position - b.position);
  }, [channels]);

  // ── Context menu handlers ──

  const handleCategoryContextMenu = (e: MouseEvent, categoryId: string) => {
    if (!canManageChannels) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'category', id: categoryId });
  };

  const handleChannelContextMenu = (e: MouseEvent, channelId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'channel', id: channelId });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!activeServerId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!confirm(`Delete category "${cat?.name}"? Channels in this category will become uncategorized.`)) return;
    try {
      await deleteCategory(activeServerId, categoryId);
    } catch {
      // deletion failed
    }
  };

  const handleStartRenameCategory = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setEditingCategoryId(categoryId);
    setEditingCategoryName(cat.name);
  };

  const handleSaveCategoryRename = async () => {
    if (!editingCategoryId || !activeServerId || !editingCategoryName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    try {
      await updateCategory(activeServerId, editingCategoryId, { name: editingCategoryName.trim() });
    } catch {
      // rename failed
    }
    setEditingCategoryId(null);
  };

  const handleCategoryRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveCategoryRename();
    } else if (e.key === 'Escape') {
      setEditingCategoryId(null);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!activeServerId) return;
    const ch = channels.find((c) => c.id === channelId);
    if (!confirm(`Delete channel #${ch?.name}? This cannot be undone.`)) return;
    try {
      await deleteChannel(activeServerId, channelId);
    } catch {
      // deletion failed
    }
  };

  const handleEditChannel = (channelId: string) => {
    const ch = channels.find((c) => c.id === channelId);
    if (ch) setEditingChannel(ch);
  };

  const handleUserContextMenu = (e: MouseEvent, targetUserId: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'user', id: targetUserId });
  };

  const handleKickUser = async (userId: string) => {
    if (!activeServerId) return;
    const member = members.find((m) => m.userId === userId);
    if (!member || !confirm(`Kick ${member.user.displayName} from the server?`)) return;
    try {
      await api.delete(`/api/servers/${activeServerId}/members/${userId}`);
    } catch {
      // kick failed
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!activeServerId) return;
    const member = members.find((m) => m.userId === userId);
    if (!member || !confirm(`Ban ${member.user.displayName} from the server? They will not be able to rejoin.`)) return;
    try {
      await api.post(`/api/servers/${activeServerId}/bans/${userId}`, { reason: null });
    } catch {
      // ban failed
    }
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'category') {
      return [
        { label: 'Rename Category', icon: <Pencil size={14} />, onClick: () => handleStartRenameCategory(contextMenu.id) },
        { label: 'Delete Category', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDeleteCategory(contextMenu.id) },
      ];
    }
    if (contextMenu.type === 'user') {
      const member = members.find((m) => m.userId === contextMenu.id);
      const name = member?.user.displayName || 'User';
      return [
        { label: `Kick ${name}`, icon: <UserMinus size={14} />, danger: true, onClick: () => handleKickUser(contextMenu.id) },
        { label: `Ban ${name}`, icon: <ShieldBan size={14} />, danger: true, onClick: () => handleBanUser(contextMenu.id) },
      ];
    }
    const channelItems: ContextMenuItem[] = [];
    const isChMuted = notificationStore.isChannelMuted(contextMenu.id);
    channelItems.push({
      label: isChMuted ? 'Unmute Channel' : 'Mute Channel',
      icon: isChMuted ? <Bell size={14} /> : <BellOff size={14} />,
      onClick: () => {
        if (!activeServerId) return;
        if (isChMuted) {
          notificationStore.updateChannelOverride(activeServerId, contextMenu.id, { muted: false, mutedUntil: null });
        } else {
          notificationStore.updateChannelOverride(activeServerId, contextMenu.id, { muted: true, mutedUntil: null });
        }
      },
    });
    channelItems.push({
      label: 'Notification Settings',
      icon: <Bell size={14} />,
      onClick: () => setNotifChannelId(contextMenu.id),
    });
    if (canManageChannels) {
      channelItems.push(
        { label: 'Edit Channel', icon: <Pencil size={14} />, onClick: () => handleEditChannel(contextMenu.id) },
        { label: 'Delete Channel', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDeleteChannel(contextMenu.id) },
      );
    }
    return channelItems;
  };

  // ── Drag handlers ──

  const handleDragStart = useCallback((e: DragEvent, channel: Channel) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', channel.id);
    setDraggedChannelId(channel.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedChannelId(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  }, []);

  const handleDrop = useCallback((e: DragEvent, targetCategoryId: string | null, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    dragCounterRef.current = 0;

    const channelId = e.dataTransfer.getData('text/plain');
    if (!channelId || !activeServerId) return;

    const draggedChannel = channels.find((c) => c.id === channelId);
    if (!draggedChannel) return;

    // Build the new ordered list for the target category
    const targetChannels = getChannelsForCategory(targetCategoryId)
      .filter((c) => c.id !== channelId); // Remove dragged channel if it was already in this category

    // If dragging from a different category, also need to reorder the source
    const sourceCategoryId = draggedChannel.categoryId;
    const sourceChannels = sourceCategoryId !== targetCategoryId
      ? getChannelsForCategory(sourceCategoryId).filter((c) => c.id !== channelId)
      : null;

    // Insert dragged channel at the target index
    // Clamp index in case it's past the end
    const clampedIndex = Math.min(targetIndex, targetChannels.length);
    targetChannels.splice(clampedIndex, 0, draggedChannel);

    // Build update list
    const updates: { id: string; position: number; categoryId: string | null }[] = [];

    // Assign new positions to target category channels
    targetChannels.forEach((ch, i) => {
      updates.push({ id: ch.id, position: i, categoryId: targetCategoryId });
    });

    // If source category is different, re-number it too
    if (sourceChannels) {
      sourceChannels.forEach((ch, i) => {
        updates.push({ id: ch.id, position: i, categoryId: sourceCategoryId });
      });
    }

    reorderChannels(activeServerId, updates);
  }, [channels, activeServerId, getChannelsForCategory, reorderChannels]);

  const handleChannelDragOver = useCallback((e: DragEvent, categoryId: string | null, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ categoryId, index });
  }, []);

  const handleCategoryDragOver = useCallback((e: DragEvent, categoryId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Drop at end of category
    const categoryChannels = getChannelsForCategory(categoryId);
    setDropTarget({ categoryId, index: categoryChannels.length });
  }, [getChannelsForCategory]);

  const handleCategoryDrop = useCallback((e: DragEvent, categoryId: string | null) => {
    const categoryChannels = getChannelsForCategory(categoryId);
    handleDrop(e, categoryId, categoryChannels.length);
  }, [getChannelsForCategory, handleDrop]);

  // ── User drag handlers (move user between voice channels) ──

  const handleUserDragStart = useCallback((e: DragEvent, userId: string) => {

    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', userId);
    draggedUserIdRef.current = userId;
    setDraggedUserId(userId);
  }, []);

  const handleUserDragEnd = useCallback(() => {

    draggedUserIdRef.current = null;
    setDraggedUserId(null);
    setUserDropTargetChannelId(null);
  }, []);

  const handleVoiceChannelDragOver = useCallback((e: DragEvent, channelId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setUserDropTargetChannelId(channelId);
  }, []);

  const handleVoiceChannelUserDrop = useCallback((e: DragEvent, channelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const userId = draggedUserIdRef.current;

    draggedUserIdRef.current = null;
    setDraggedUserId(null);
    setUserDropTargetChannelId(null);
    if (!userId) return;

    const socket = socketService.getSocket();

    socket?.emit('voice:move-user', { targetUserId: userId, targetChannelId: channelId }, (res: any) => {

      if (res?.error) console.error('[ChannelSidebar] Failed to move user:', res.error);
    });
  }, []);

  // Group channels by category
  const sortedCategories = [...categories].sort((a, b) => a.position - b.position);
  const uncategorizedChannels = getChannelsForCategory(null);

  const renderChannel = (channel: Channel, categoryId: string | null, index: number) => {
    const isActive = channel.id === activeChannelId;
    const isVoiceActive = channel.id === voiceChannelId;
    const participants = channelParticipants[channel.id] || [];
    const unread = unreads.get(channel.id);
    const hasUnread = unread && unread.count > 0;
    const hasMentions = unread && unread.mentionCount > 0;
    const isDragged = channel.id === draggedChannelId;
    const isDropBefore = dropTarget?.categoryId === categoryId && dropTarget?.index === index && draggedChannelId !== null;
    const isChannelMuted = notificationStore.isChannelMuted(channel.id);

    const Icon = channel.type === 'text' ? Hash : Volume2;
    const isHighlighted = channel.type === 'text' ? isActive : isVoiceActive;
    const isUserDropTarget = channel.type === 'voice' && userDropTargetChannelId === channel.id && draggedUserId !== null;

    return (
      <div
        key={channel.id}
        onDragEnter={(e) => {
          if (draggedUserIdRef.current && channel.type === 'voice') {

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDragOver={(e) => {
          if (draggedUserIdRef.current) {
            if (channel.type === 'voice') {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setUserDropTargetChannelId(channel.id);
            }
            return;
          }
          handleChannelDragOver(e, categoryId, index);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving this channel entirely (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (userDropTargetChannelId === channel.id) setUserDropTargetChannelId(null);
          }
        }}
        onDrop={(e) => {
          if (draggedUserIdRef.current) {
            if (channel.type === 'voice') handleVoiceChannelUserDrop(e, channel.id);
            return;
          }
          handleDrop(e, categoryId, index);
        }}
      >
        {/* Drop indicator line */}
        {isDropBefore && (
          <div className="mx-1 h-0.5 rounded bg-dc-accent" />
        )}
        <div
          draggable={canManageChannels && !draggedUserId}
          onDragStart={(e) => handleDragStart(e, channel)}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
          className={`${isDragged ? 'opacity-40' : ''} ${canManageChannels && !draggedUserId ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <button
            onClick={() => handleChannelClick(channel.id, channel.type)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors ${
              isUserDropTarget
                ? 'bg-ec-bg-modifier-hover ring-1 ring-dc-accent'
                : isHighlighted
                  ? 'bg-ec-bg-modifier-selected text-ec-interactive-active'
                  : hasUnread
                    ? 'text-ec-text-primary hover:bg-ec-bg-modifier-hover'
                    : 'text-ec-channel-default hover:bg-ec-bg-modifier-hover hover:text-ec-interactive-hover'
            }`}
          >
            <Icon size={20} className="shrink-0 opacity-70" />
            <span className={`truncate text-sm ${hasUnread && !isHighlighted ? 'font-semibold' : ''}`}>
              {channel.name}
            </span>
            {isChannelMuted && (
              <BellOff size={14} className="shrink-0 text-ec-text-muted" />
            )}
            {hasMentions && (
              <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread.mentionCount}
              </span>
            )}
          </button>
        </div>
        {channel.type === 'voice' && participants.length > 0 && (
          <div className="ml-7 space-y-0.5 py-1">
            {participants.map((userId) => {
              const member = members.find((m) => m.userId === userId);
              const displayName = member?.user.displayName || userId;
              const avatarUrl = member?.user.avatarUrl || null;
              const isSpeaking = speaking.get(userId) || false;
              const voiceState = userVoiceStates[userId];
              const isDeafened = voiceState?.deafened || false;
              const isMuted = voiceState?.muted || false;
              const mediaState = userMediaStates[userId];
              const hasCameraOn = mediaState?.cameraOn || false;
              const hasScreenShare = mediaState?.screenSharing || false;
              const isUserDragged = userId === draggedUserId;

              return (
                <div
                  key={userId}
                  draggable={canManageChannels}
                  onDragStart={(e) => handleUserDragStart(e, userId)}
                  onDragEnd={handleUserDragEnd}
                  onContextMenu={(e) => handleUserContextMenu(e, userId)}
                  className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-ec-bg-modifier-hover ${isUserDragged ? 'opacity-40' : ''} ${canManageChannels ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <Avatar
                    username={displayName}
                    avatarUrl={avatarUrl}
                    size={24}
                    speaking={isSpeaking}
                  />
                  <span className="flex-1 truncate text-xs text-ec-text-secondary">{displayName}</span>
                  {hasScreenShare && (
                    <Monitor size={14} className="shrink-0 text-green" />
                  )}
                  {hasCameraOn && (
                    <Video size={14} className="shrink-0 text-green" />
                  )}
                  {isDeafened ? (
                    <HeadphoneOff size={14} className="shrink-0 text-ec-text-muted" />
                  ) : isMuted ? (
                    <MicOff size={14} className="shrink-0 text-ec-text-muted" />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCategorySection = (category: ChannelCategory | null, channelList: Channel[]) => {
    const categoryId = category?.id ?? null;
    const isCollapsed = category ? collapsedCategories.has(category.id) : false;
    const categoryName = category?.name ?? 'Channels';
    const isDropAtEnd = dropTarget?.categoryId === categoryId && dropTarget?.index === channelList.length && draggedChannelId !== null;
    const isEditing = category && editingCategoryId === category.id;

    return (
      <div
        key={category?.id ?? 'uncategorized'}
        className="mb-1"
        onDragOver={(e) => {
          // Only act as drop zone when collapsed or empty
          if (isCollapsed || channelList.length === 0) {
            handleCategoryDragOver(e, categoryId);
          }
        }}
        onDrop={(e) => {
          if (isCollapsed || channelList.length === 0) {
            handleCategoryDrop(e, categoryId);
          }
        }}
      >
        <div className="flex items-center justify-between px-1 pb-1">
          {isEditing ? (
            <input
              ref={categoryInputRef}
              value={editingCategoryName}
              onChange={(e) => setEditingCategoryName(e.target.value)}
              onBlur={handleSaveCategoryRename}
              onKeyDown={handleCategoryRenameKeyDown}
              className="flex-1 rounded bg-ec-input-bg px-1 py-0.5 text-xs font-semibold uppercase text-ec-text-primary outline-none"
            />
          ) : (
            <button
              onClick={() => category && toggleCategory(category.id)}
              onContextMenu={(e) => category && handleCategoryContextMenu(e, category.id)}
              className="flex items-center gap-0.5 text-xs font-semibold uppercase text-ec-text-muted hover:text-ec-text-secondary"
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {categoryName}
            </button>
          )}
          {canManageChannels && (
            <button
              onClick={() => setShowChannelModal(true)}
              className="text-ec-text-muted hover:text-ec-text-secondary"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {!isCollapsed && channelList.map((ch, i) => renderChannel(ch, categoryId, i))}
        {/* Drop indicator at end of list */}
        {!isCollapsed && isDropAtEnd && (
          <div className="mx-1 h-0.5 rounded bg-dc-accent" />
        )}
      </div>
    );
  };

  return (
    <div className="flex w-60 shrink-0 flex-col bg-ec-bg-secondary">
      {/* Server name header */}
      <div className="titlebar-drag flex h-12 items-center justify-between border-b border-ec-bg-tertiary px-4">
        <h2 className="titlebar-no-drag truncate text-base font-semibold text-ec-text-primary">
          {server?.name}
        </h2>
        <div className="titlebar-no-drag flex items-center gap-1">
          <button
            onClick={() => setShowServerNotifModal(true)}
            className={`rounded p-1 hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary ${
              activeServerId && notificationStore.isServerMuted(activeServerId) ? 'text-red-400' : 'text-ec-text-muted'
            }`}
            title="Notification Settings"
          >
            {activeServerId && notificationStore.isServerMuted(activeServerId) ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="rounded p-1 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
            title="Invite People"
          >
            <UserPlus size={16} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="rounded p-1 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
              title="Server Settings"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Channel list */}
      <div className="scrollbar-echo flex-1 overflow-y-auto px-2 pt-4">
        {/* Uncategorized channels */}
        {uncategorizedChannels.length > 0 &&
          renderCategorySection(null, uncategorizedChannels)}

        {/* Categorized channels */}
        {sortedCategories.map((category) => {
          const categoryChannels = getChannelsForCategory(category.id);
          return renderCategorySection(category, categoryChannels);
        })}

        {/* Create category button */}
        {canManageChannels && (
          <button
            onClick={() => setShowCategoryModal(true)}
            className="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
          >
            <FolderPlus size={14} />
            <span>Create Category</span>
          </button>
        )}
      </div>

      <UserPanel />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showChannelModal && activeServerId && (
        <CreateChannelModal serverId={activeServerId} onClose={() => setShowChannelModal(false)} />
      )}
      {showCategoryModal && activeServerId && (
        <CreateCategoryModal serverId={activeServerId} onClose={() => setShowCategoryModal(false)} />
      )}
      {editingChannel && activeServerId && (
        <EditChannelModal serverId={activeServerId} channel={editingChannel} onClose={() => setEditingChannel(null)} />
      )}
      {showInviteModal && activeServerId && (
        <InviteModal serverId={activeServerId} onClose={() => setShowInviteModal(false)} />
      )}
      {showSettingsModal && activeServerId && (
        <ServerSettingsModal serverId={activeServerId} onClose={() => setShowSettingsModal(false)} />
      )}
      {showServerNotifModal && activeServerId && (
        <NotificationSettingsModal mode="server" serverId={activeServerId} onClose={() => setShowServerNotifModal(false)} />
      )}
      {notifChannelId && activeServerId && (
        <NotificationSettingsModal mode="channel" serverId={activeServerId} channelId={notifChannelId} onClose={() => setNotifChannelId(null)} />
      )}
    </div>
  );
}
