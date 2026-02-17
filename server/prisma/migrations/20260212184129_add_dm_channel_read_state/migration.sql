-- CreateTable
CREATE TABLE "DMChannelReadState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DMChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DMChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DMChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DMChannelReadState_userId_channelId_key" ON "DMChannelReadState"("userId", "channelId");
