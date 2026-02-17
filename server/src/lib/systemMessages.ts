import { prisma } from './prisma.js';
import { MESSAGE_INCLUDE, serializeMessage } from './serializers.js';
import type { Message } from '../../../shared/types.js';

export async function createSystemMessage(
  channelId: string,
  authorId: string,
  type: string,
  content: string,
): Promise<Message> {
  const message = await prisma.message.create({
    data: {
      content,
      type,
      channelId,
      authorId,
    },
    include: MESSAGE_INCLUDE,
  });
  return serializeMessage(message);
}
