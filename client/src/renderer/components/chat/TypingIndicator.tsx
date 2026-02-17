import { useTypingStore } from '../../stores/typingStore';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  channelId: string;
}

export default function TypingIndicator({ channelId }: Props) {
  const getTypingUsers = useTypingStore((s) => s.getTypingUsers);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Re-subscribe to typing map changes so the component re-renders
  useTypingStore((s) => s.typing);

  const typingUsers = getTypingUsers(channelId).filter(
    (u) => u.userId !== currentUserId,
  );

  if (typingUsers.length === 0) {
    // Reserve the space so the layout doesn't jump
    return <div className="h-6 shrink-0 px-4" />;
  }

  let text: string;
  if (typingUsers.length === 1) {
    text = `${typingUsers[0].username} is typing`;
  } else if (typingUsers.length === 2) {
    text = `${typingUsers[0].username} and ${typingUsers[1].username} are typing`;
  } else {
    text = 'Several people are typing';
  }

  return (
    <div className="flex h-6 shrink-0 items-center gap-1 px-4 text-xs text-ec-text-muted">
      {/* Animated dots */}
      <span className="inline-flex gap-[2px]">
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-ec-text-muted [animation-delay:0ms]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-ec-text-muted [animation-delay:150ms]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-ec-text-muted [animation-delay:300ms]" />
      </span>
      <span>
        <strong className="font-semibold text-ec-text-secondary">{text}</strong>...
      </span>
    </div>
  );
}
