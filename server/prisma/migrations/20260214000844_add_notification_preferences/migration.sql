-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'everything',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" DATETIME,
    "suppressEveryone" BOOLEAN NOT NULL DEFAULT false,
    "suppressHere" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelNotificationOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'default',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" DATETIME,
    CONSTRAINT "ChannelNotificationOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelNotificationOverride_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_serverId_key" ON "NotificationPreference"("userId", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelNotificationOverride_userId_channelId_key" ON "ChannelNotificationOverride"("userId", "channelId");
