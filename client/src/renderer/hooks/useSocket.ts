import { useEffect } from 'react';
import { socketService } from '../services/socketService';
import { voiceService } from '../services/voiceService';
import { useMessageStore } from '../stores/messageStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useServerStore } from '../stores/serverStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useAuthStore } from '../stores/authStore';
import { useTypingStore } from '../stores/typingStore';
import { useFriendStore } from '../stores/friendStore';
import { useDMStore } from '../stores/dmStore';
import { useUnreadStore } from '../stores/unreadStore';
import { useThreadStore } from '../stores/threadStore';
import { useNotificationStore } from '../stores/notificationStore';
import { api } from '../lib/api';
import { playbackSoundboardSound } from '../lib/soundboardPlayback';
import { playSoundEffect } from '../lib/soundEffects';
import type { Message, Channel, Member, Reaction, Embed, Server, Friendship, DMChannel, DMMessage, UserVoiceState, UserMediaState, User, Thread, NotificationPayload } from '../../../../shared/types';

export function useSocket() {
  const addMessage = useMessageStore((s) => s.addMessage);
  const removeMessage = useMessageStore((s) => s.removeMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const updateReactions = useMessageStore((s) => s.updateReactions);
  const updateEmbeds = useMessageStore((s) => s.updateEmbeds);
  const pinMessage = useMessageStore((s) => s.pinMessage);
  const unpinMessage = useMessageStore((s) => s.unpinMessage);
  const setOnlineUsers = usePresenceStore((s) => s.setOnlineUsers);
  const setUserOnline = usePresenceStore((s) => s.setUserOnline);
  const setUserOffline = usePresenceStore((s) => s.setUserOffline);
  const addChannel = useServerStore((s) => s.addChannel);
  const updateChannel = useServerStore((s) => s.updateChannel);
  const removeChannel = useServerStore((s) => s.removeChannel);
  const setChannels = useServerStore((s) => s.setChannels);
  const addMember = useServerStore((s) => s.addMember);
  const removeMember = useServerStore((s) => s.removeMember);
  const updateServer = useServerStore((s) => s.updateServer);
  const updateMemberUser = useServerStore((s) => s.updateMemberUser);
  const addParticipant = useVoiceStore((s) => s.addParticipant);
  const removeParticipant = useVoiceStore((s) => s.removeParticipant);
  const setChannelParticipants = useVoiceStore((s) => s.setChannelParticipants);
  const addChannelParticipant = useVoiceStore((s) => s.addChannelParticipant);
  const removeChannelParticipant = useVoiceStore((s) => s.removeChannelParticipant);
  const setUserVoiceState = useVoiceStore((s) => s.setUserVoiceState);
  const setAllVoiceStates = useVoiceStore((s) => s.setAllVoiceStates);
  const removeUserVoiceState = useVoiceStore((s) => s.removeUserVoiceState);
  const setUserMediaState = useVoiceStore((s) => s.setUserMediaState);
  const setAllMediaStates = useVoiceStore((s) => s.setAllMediaStates);
  const removeUserMediaState = useVoiceStore((s) => s.removeUserMediaState);
  const addTyping = useTypingStore((s) => s.addTyping);
  const removeTyping = useTypingStore((s) => s.removeTyping);
  const addFriendship = useFriendStore((s) => s.addFriendship);
  const updateFriendship = useFriendStore((s) => s.updateFriendship);
  const removeFriendship = useFriendStore((s) => s.removeFriendship);
  const addDMMessage = useDMStore((s) => s.addMessage);
  const updateDMMessage = useDMStore((s) => s.updateMessage);
  const removeDMMessage = useDMStore((s) => s.removeMessage);
  const addDMChannel = useDMStore((s) => s.addChannel);
  const setUnread = useUnreadStore((s) => s.setUnread);
  const setBulkUnread = useUnreadStore((s) => s.setBulkUnread);
  const clearUnread = useUnreadStore((s) => s.clearUnread);
  const clearThreadUnread = useUnreadStore((s) => s.clearThreadUnread);
  const addThreadMessage = useThreadStore((s) => s.addThreadMessage);
  const removeThreadMessage = useThreadStore((s) => s.removeThreadMessage);
  const updateThreadMessage = useThreadStore((s) => s.updateThreadMessage);
  const updateThreadReactions = useThreadStore((s) => s.updateThreadReactions);
  const updateThreadEmbeds = useThreadStore((s) => s.updateThreadEmbeds);
  const updateThread = useThreadStore((s) => s.updateThread);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) {
      console.warn('[useSocket] No socket available');
      return;
    }
    console.log('[useSocket] Registering handlers, socket connected:', socket.connected);

    const handlers = {
      'message:new': (message: Message) => {
        console.log('[useSocket] message:new received', message.id, message.channelId);
        addMessage(message);
        removeTyping(message.channelId, message.authorId);

        // Auto-ack if user is currently viewing this channel
        const activeChannelId = useServerStore.getState().activeChannelId;
        const activeServerId = useServerStore.getState().activeServerId;
        if (activeChannelId === message.channelId && activeServerId) {
          clearUnread(message.channelId);
          api.post(`/api/servers/${activeServerId}/channels/${message.channelId}/ack`, { messageId: message.id }).catch(() => {});
        }
      },
      'message:deleted': (data: { messageId: string; channelId: string }) =>
        removeMessage(data.messageId, data.channelId),
      'message:edited': (message: Message) => updateMessage(message),
      'message:reaction-updated': (data: { messageId: string; channelId: string; reactions: Reaction[] }) =>
        updateReactions(data.messageId, data.channelId, data.reactions),
      'message:embeds-ready': (data: { messageId: string; channelId: string; embeds: Embed[] }) =>
        updateEmbeds(data.messageId, data.channelId, data.embeds),
      'message:pinned': (message: Message) => pinMessage(message),
      'message:unpinned': (data: { messageId: string; channelId: string }) =>
        unpinMessage(data.messageId, data.channelId),
      'presence:online-users': (userIds: string[]) => setOnlineUsers(userIds),
      'user:online': (userId: string) => setUserOnline(userId),
      'user:offline': (userId: string) => setUserOffline(userId),
      'user:updated': (user: User) => updateMemberUser(user),
      'server:updated': (server: Server) => updateServer(server),
      'channel:created': (channel: Channel) => addChannel(channel),
      'channel:updated': (channel: Channel) => updateChannel(channel),
      'channel:deleted': (data: { channelId: string; serverId: string }) => removeChannel(data.channelId),
      'channels:reordered': (data: { serverId: string; channels: Channel[] }) => setChannels(data.channels),
      'member:joined': (member: Member) => addMember(member),
      'member:left': (data: { userId: string }) => removeMember(data.userId),
      'voice:channel-participants': (data: Record<string, string[]>) => setChannelParticipants(data),
      'voice:participants': (data: { channelId: string; participants: string[] }) => {
        // Authoritative participant list for a specific channel (sent after join)
        const cp = { ...useVoiceStore.getState().channelParticipants, [data.channelId]: data.participants };
        setChannelParticipants(cp);
      },
      'voice:user-joined': (data: { userId: string; channelId: string }) => {
        addParticipant(data.userId);
        addChannelParticipant(data.channelId, data.userId);
        // Play sound if we're in the same channel
        if (useVoiceStore.getState().channelId === data.channelId) {
          playSoundEffect('userJoin');
        }
      },
      'voice:user-left': (data: { userId: string; channelId: string }) => {
        removeParticipant(data.userId);
        removeChannelParticipant(data.channelId, data.userId);
        removeUserVoiceState(data.userId);
        removeUserMediaState(data.userId);
        // Play sound if we're in the same channel
        if (useVoiceStore.getState().channelId === data.channelId) {
          playSoundEffect('userLeave');
        }
      },
      'voice:voice-state-update': (data: { userId: string; muted: boolean; deafened: boolean }) => {
        setUserVoiceState(data.userId, { muted: data.muted, deafened: data.deafened });
      },
      'voice:all-voice-states': (data: Record<string, UserVoiceState>) => {
        setAllVoiceStates(data);
      },
      'voice:media-state-update': (data: { userId: string; cameraOn: boolean; screenSharing: boolean }) => {
        setUserMediaState(data.userId, { cameraOn: data.cameraOn, screenSharing: data.screenSharing });
      },
      'voice:all-media-states': (data: Record<string, UserMediaState>) => {
        setAllMediaStates(data);
      },
      // AFK move
      'voice:afk-move': (data: { channelId: string }) => {
        console.log('[useSocket] voice:afk-move received, target channel:', data.channelId);
        const currentUserId = useAuthStore.getState().user?.id;
        const store = useVoiceStore.getState();
        const oldChannelId = store.channelId;

        // Stop camera and screen share before moving
        if (store.cameraOn) {
          voiceService.stopVideo();
          store.setCameraOn(false);
          store.setLocalVideoStream(null);
        }
        if (store.screenSharing) {
          voiceService.stopScreenShare();
          store.setScreenSharing(false);
          store.setLocalScreenStream(null);
        }

        if (oldChannelId && currentUserId) {
          store.removeChannelParticipant(oldChannelId, currentUserId);
        }
        voiceService.join(data.channelId).then(() => {
          store.setConnected(true, data.channelId);
          // Force muted in AFK channel
          voiceService.setMuteDeafenState(true, false);
          store.setMuted(true);
          store.setDeafened(false);
          if (currentUserId) {
            store.addChannelParticipant(data.channelId, currentUserId);
            store.setUserVoiceState(currentUserId, { muted: true, deafened: false });
            store.setUserMediaState(currentUserId, { cameraOn: false, screenSharing: false });
            const socket = socketService.getSocket();
            socket?.emit('voice:voice-state-update', { muted: true, deafened: false });
            socket?.emit('voice:media-state-update', { cameraOn: false, screenSharing: false });
          }
        }).catch((err) => {
          console.error('[useSocket] Failed to join AFK channel:', err);
        });
      },
      // Admin moved us to another channel
      'voice:move': (data: { channelId: string }) => {
        console.log('[useSocket] voice:move received, target channel:', data.channelId);
        const currentUserId = useAuthStore.getState().user?.id;
        const store = useVoiceStore.getState();
        const oldChannelId = store.channelId;

        // Stop camera and screen share before moving
        if (store.cameraOn) {
          voiceService.stopVideo();
          store.setCameraOn(false);
          store.setLocalVideoStream(null);
        }
        if (store.screenSharing) {
          voiceService.stopScreenShare();
          store.setScreenSharing(false);
          store.setLocalScreenStream(null);
        }

        if (oldChannelId && currentUserId) {
          store.removeChannelParticipant(oldChannelId, currentUserId);
        }
        voiceService.join(data.channelId).then(() => {
          store.setConnected(true, data.channelId);
          // Preserve current mute/deafen state
          const { muted, deafened } = store;
          voiceService.setMuteDeafenState(muted, deafened);
          if (currentUserId) {
            store.addChannelParticipant(data.channelId, currentUserId);
            const socket = socketService.getSocket();
            socket?.emit('voice:voice-state-update', { muted, deafened });
            socket?.emit('voice:media-state-update', { cameraOn: false, screenSharing: false });
          }
        }).catch((err) => {
          console.error('[useSocket] Failed to join channel after move:', err);
        });
      },
      // Server forces mute (e.g. in AFK channel)
      'voice:force-mute': (data: { muted: boolean }) => {
        if (data.muted) {
          voiceService.setMuteDeafenState(true, useVoiceStore.getState().deafened);
          useVoiceStore.getState().setMuted(true);
          const currentUserId = useAuthStore.getState().user?.id;
          if (currentUserId) {
            useVoiceStore.getState().setUserVoiceState(currentUserId, { muted: true, deafened: useVoiceStore.getState().deafened });
          }
        }
      },
      // Soundboard
      'soundboard:play': (data: { soundId: string; soundUrl: string; userId: string; volume: number }) => {
        if (!useVoiceStore.getState().deafened) {
          playbackSoundboardSound(data);
        }
      },
      // Typing
      'typing:start': (data: { channelId: string; userId: string; username: string }) =>
        addTyping(data.channelId, data.userId, data.username),
      'typing:stop': (data: { channelId: string; userId: string }) =>
        removeTyping(data.channelId, data.userId),
      // Friends
      'friend:request-received': (friendship: Friendship) => addFriendship(friendship),
      'friend:request-accepted': (friendship: Friendship) => updateFriendship(friendship),
      'friend:removed': (data: { friendshipId: string }) => removeFriendship(data.friendshipId),
      // DMs
      'dm:new': (data: { channel: DMChannel }) => addDMChannel(data.channel),
      'dm:message': (message: DMMessage) => {
        addDMMessage(message);

        // Auto-ack if user is currently viewing this DM
        const activeDMChannelId = useDMStore.getState().activeDMChannelId;
        if (activeDMChannelId === message.channelId) {
          clearUnread(message.channelId);
          api.post(`/api/dms/${message.channelId}/ack`, { messageId: message.id }).catch(() => {});
        }
      },
      'dm:edited': (message: DMMessage) => updateDMMessage(message),
      'dm:deleted': (data: { messageId: string; channelId: string }) =>
        removeDMMessage(data.channelId, data.messageId),
      'dm:typing-start': (data: { channelId: string; userId: string; username: string }) =>
        addTyping(data.channelId, data.userId, data.username),
      'dm:typing-stop': (data: { channelId: string; userId: string }) =>
        removeTyping(data.channelId, data.userId),
      // Unread
      'unread:update': (data: { channelId: string; serverId: string | null; unreadCount: number; mentionCount: number; threadId?: string }) =>
        setUnread(data.channelId, data.serverId, data.unreadCount, data.mentionCount, data.threadId),
      'unread:initial': (data: Array<{ channelId: string; serverId: string | null; unreadCount: number; mentionCount: number; threadId?: string }>) =>
        setBulkUnread(data),
      // Threads
      'thread:message:new': (message: Message) => {
        addThreadMessage(message);

        // Auto-ack if user is currently viewing this thread
        const activeThread = useThreadStore.getState().activeThread;
        const activeServerId = useServerStore.getState().activeServerId;
        if (activeThread && message.threadId === activeThread.id && activeServerId) {
          clearThreadUnread(activeThread.id);
          api.post(`/api/servers/${activeServerId}/threads/${activeThread.id}/ack`, { messageId: message.id }).catch(() => {});
        }
      },
      'thread:message:deleted': (data: { messageId: string; threadId: string }) =>
        removeThreadMessage(data.messageId, data.threadId),
      'thread:message:edited': (message: Message) => updateThreadMessage(message),
      'thread:message:reaction-updated': (data: { messageId: string; threadId: string; reactions: Reaction[] }) =>
        updateThreadReactions(data.messageId, data.threadId, data.reactions),
      'thread:message:embeds-ready': (data: { messageId: string; threadId: string; embeds: Embed[] }) =>
        updateThreadEmbeds(data.messageId, data.threadId, data.embeds),
      'thread:updated': (data: { threadId: string; channelId: string; messageCount: number; lastActivityAt: string; starterMessageId?: string; name?: string; archived?: boolean }) => {
        updateThread(data.threadId, {
          messageCount: data.messageCount,
          lastActivityAt: data.lastActivityAt,
          ...(data.name !== undefined && { name: data.name }),
          ...(data.archived !== undefined && { archived: data.archived }),
        });

        // Update the thread summary on the starter message in the channel
        if (data.starterMessageId) {
          const channelMessages = useMessageStore.getState().messages.get(data.channelId);
          if (channelMessages) {
            const starterMsg = channelMessages.find((m) => m.id === data.starterMessageId);
            if (starterMsg && starterMsg.thread) {
              const updatedMsg = {
                ...starterMsg,
                thread: {
                  ...starterMsg.thread,
                  messageCount: data.messageCount,
                  lastActivityAt: data.lastActivityAt,
                  ...(data.name !== undefined && { name: data.name }),
                },
              };
              useMessageStore.getState().updateMessage(updatedMsg);
            }
          }
        }
      },
      'thread:typing:start': (data: { threadId: string; userId: string; username: string }) =>
        addTyping(`thread:${data.threadId}`, data.userId, data.username),
      'thread:typing:stop': (data: { threadId: string; userId: string }) =>
        removeTyping(`thread:${data.threadId}`, data.userId),
      // Desktop notifications
      'notification:push': (data: NotificationPayload) => {
        // Skip if desktop notifications are disabled
        if (!useNotificationStore.getState().desktopNotificationsEnabled) return;

        playSoundEffect('notification');

        // Skip if user is currently viewing the channel/DM/thread AND window is focused
        const activeChannelId = useServerStore.getState().activeChannelId;
        const activeDMChannelId = useDMStore.getState().activeDMChannelId;
        const activeThread = useThreadStore.getState().activeThread;
        const isFocused = document.hasFocus();

        if (isFocused) {
          if (data.type === 'channel_message' && activeChannelId === data.channelId) return;
          if (data.type === 'dm_message' && activeDMChannelId === data.channelId) return;
          if (data.type === 'thread_message' && activeThread?.id === data.threadId) return;
        }

        // Show notification via Electron or browser API
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.showNotification) {
          electronAPI.showNotification({ title: data.title, body: data.body });
        } else if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(data.title, { body: data.body });
        }
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler as any);
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler as any);
      }
    };
  }, [addMessage, removeMessage, updateMessage, updateReactions, updateEmbeds, pinMessage, unpinMessage, setOnlineUsers, setUserOnline, setUserOffline, updateMemberUser, updateServer, addChannel, updateChannel, removeChannel, setChannels, addMember, removeMember, addParticipant, removeParticipant, setChannelParticipants, addChannelParticipant, removeChannelParticipant, setUserVoiceState, setAllVoiceStates, removeUserVoiceState, setUserMediaState, setAllMediaStates, removeUserMediaState, addTyping, removeTyping, addFriendship, updateFriendship, removeFriendship, addDMMessage, updateDMMessage, removeDMMessage, addDMChannel, setUnread, setBulkUnread, clearUnread, clearThreadUnread, addThreadMessage, removeThreadMessage, updateThreadMessage, updateThreadReactions, updateThreadEmbeds, updateThread]);
}
