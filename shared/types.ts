// ── Model types ──

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  bio?: string | null;
  customStatus?: string | null;
  bannerColor?: string | null;
  bannerUrl?: string | null;
  pronouns?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

export type UserStatus = 'online' | 'offline';

export interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  ownerId: string;
  afkChannelId: string | null;
  afkTimeout: number;
}

export interface Member {
  id: string;
  role: MemberRole;
  userId: string;
  serverId: string;
  user: User;
  memberRoles?: { role: Role }[];
}

export type MemberRole = 'owner' | 'admin' | 'member';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  serverId: string;
  categoryId: string | null;
}

export type ChannelType = 'text' | 'voice';

export interface ChannelCategory {
  id: string;
  name: string;
  position: number;
  serverId: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface Embed {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  favicon: string | null;
}

export interface MessageReplyTo {
  id: string;
  content: string;
  author: Pick<User, 'id' | 'username' | 'displayName'>;
}

export interface Message {
  id: string;
  content: string;
  type?: string;
  channelId: string;
  authorId: string;
  threadId?: string | null;
  webhookId?: string | null;
  webhookName?: string | null;
  webhookAvatarUrl?: string | null;
  createdAt: string;
  editedAt: string | null;
  author: User;
  attachments: Attachment[];
  reactions: Reaction[];
  embeds: Embed[];
  replyTo?: MessageReplyTo | null;
  pinnedAt?: string | null;
  pinnedById?: string | null;
  mentions?: string[]; // userIds mentioned
  thread?: ThreadSummary | null;
}

export interface ThreadSummary {
  id: string;
  name: string;
  messageCount: number;
  lastActivityAt: string;
  participantCount: number;
  participantAvatars: string[];
}

export interface Thread {
  id: string;
  name: string;
  channelId: string;
  starterMessageId: string;
  creatorId: string;
  archived: boolean;
  lastActivityAt: string;
  messageCount: number;
  createdAt: string;
  creator: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  lastMessage?: Message | null;
  participantCount: number;
  participantAvatars: string[];
}

export interface InvitePreview {
  code: string;
  serverName: string;
  memberCount: number;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface Friendship {
  id: string;
  status: FriendshipStatus;
  senderId: string;
  receiverId: string;
  createdAt: string;
  sender: User;
  receiver: User;
}

export interface DMChannel {
  id: string;
  createdAt: string;
  participants: DMParticipant[];
  lastMessage?: DMMessage | null;
}

export interface DMParticipant {
  id: string;
  userId: string;
  channelId: string;
  user: User;
}

export interface DMMessage {
  id: string;
  content: string;
  channelId: string;
  authorId: string;
  createdAt: string;
  editedAt: string | null;
  author: User;
}

export interface Role {
  id: string;
  name: string;
  color: string | null;
  position: number;
  permissions: string;
  serverId: string;
}

export interface ServerBan {
  id: string;
  userId: string;
  serverId: string;
  reason: string | null;
  bannedById: string;
  createdAt: string;
  user?: User;
}

export interface SoundboardSound {
  id: string;
  name: string;
  emoji: string | null;
  filename: string;
  serverId: string;
  uploaderId: string;
  createdAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  avatarUrl: string | null;
  token: string;
  channelId: string;
  serverId: string;
  creatorId: string;
  createdAt: string;
}

// ── Notification Preferences ──

export type NotificationLevel = 'everything' | 'mentions' | 'nothing';
export type ChannelNotificationLevel = 'default' | 'everything' | 'mentions' | 'nothing';

export interface NotificationPreference {
  id: string;
  userId: string;
  serverId: string;
  level: NotificationLevel;
  muted: boolean;
  mutedUntil: string | null;
  suppressEveryone: boolean;
  suppressHere: boolean;
}

export interface ChannelNotificationOverride {
  id: string;
  userId: string;
  channelId: string;
  level: ChannelNotificationLevel;
  muted: boolean;
  mutedUntil: string | null;
}

export interface NotificationPayload {
  type: 'channel_message' | 'dm_message' | 'thread_message';
  title: string;
  body: string;
  authorName: string;
  authorAvatarUrl: string | null;
  serverId?: string;
  channelId: string;
  messageId: string;
  threadId?: string;
}

// ── Voice State ──

export type ProducerMediaType = 'audio' | 'video' | 'screen' | 'screen-audio';

export interface UserVoiceState {
  muted: boolean;
  deafened: boolean;
}

export interface UserMediaState {
  cameraOn: boolean;
  screenSharing: boolean;
}

