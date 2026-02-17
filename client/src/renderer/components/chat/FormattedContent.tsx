import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../../stores/authStore';
import { useServerStore } from '../../stores/serverStore';

interface Props {
  content: string;
  mentions?: string[]; // userIds mentioned
}

function SpoilerSpan({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={`cursor-pointer rounded px-0.5 ${
        revealed ? 'bg-ec-bg-modifier-hover text-ec-text-secondary' : 'bg-ec-text-muted text-transparent'
      }`}
    >
      {text}
    </span>
  );
}

export default function FormattedContent({ content, mentions }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useServerStore((s) => s.members);
  const isSelfMentioned = mentions?.includes(currentUserId ?? '');

  // Process spoilers: encode ||text|| so markdown doesn't strip them
  // Process @mentions: encode @username so we can style them
  // Use Unicode Private Use Area characters as markers (won't be stripped by markdown/browser)
  const M_START = '\uE000';
  const M_END = '\uE001';
  let processed = content.replace(/\|\|(.+?)\|\|/g, `\`${M_START}SPOILER:$1${M_END}\``);
  // Handle @everyone and @here before username mentions
  processed = processed.replace(/@(everyone|here)\b/g, `\`${M_START}SPECIAL:$1${M_END}\``);
  processed = processed.replace(/@(\w+)/g, (match, username) => {
    if (username === 'everyone' || username === 'here') return match; // Already handled
    const member = members.find(
      (m) => m.user.username.toLowerCase() === username.toLowerCase(),
    );
    if (member) {
      return `\`${M_START}MENTION:${username}${M_END}\``;
    }
    return match;
  });

  return (
    <span className="break-words text-ec-text-secondary [&>*:first-child]:inline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Suppress block-level elements Discord-style
          h1: ({ children }) => <strong>{children}</strong>,
          h2: ({ children }) => <strong>{children}</strong>,
          h3: ({ children }) => <strong>{children}</strong>,
          h4: ({ children }) => <strong>{children}</strong>,
          h5: ({ children }) => <strong>{children}</strong>,
          h6: ({ children }) => <strong>{children}</strong>,
          img: () => null,
          hr: () => null,
          p: ({ children }) => <span>{children}</span>,
          blockquote: ({ children }) => (
            <div className="my-0.5 border-l-4 border-ec-text-muted pl-2">{children}</div>
          ),
          ul: ({ children }) => <ul className="ml-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal">{children}</ol>,
          a: ({ href, children }) => {
            const isSafeLink = href && (href.startsWith('http:') || href.startsWith('https:'));
            if (!isSafeLink) {
              return <span>{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ec-text-link hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  if (href) window.open(href, '_blank');
                }}
              >
                {children}
              </a>
            );
          },
          code: ({ className, children, ...props }) => {
            const text = String(children).replace(/\n$/, '');
            // Check for spoiler marker
            if (text.startsWith('\uE000SPOILER:') && text.endsWith('\uE001')) {
              const spoilerText = text.slice(9, -1);
              return <SpoilerSpan text={spoilerText} />;
            }
            // Check for @everyone/@here marker
            if (text.startsWith('\uE000SPECIAL:') && text.endsWith('\uE001')) {
              const specialType = text.slice(9, -1); // 'everyone' or 'here'
              return (
                <span
                  className="cursor-pointer rounded px-0.5 font-medium bg-accent/20 text-[#dee0fc] hover:bg-accent/40"
                >
                  @{specialType}
                </span>
              );
            }
            // Check for mention marker
            if (text.startsWith('\uE000MENTION:') && text.endsWith('\uE001')) {
              const username = text.slice(9, -1);
              const mentionedMember = members.find(
                (m) => m.user.username.toLowerCase() === username.toLowerCase(),
              );
              const isSelf = mentionedMember?.userId === currentUserId;
              return (
                <span
                  className={`cursor-pointer rounded px-0.5 font-medium ${
                    isSelf
                      ? 'bg-accent/30 text-white'
                      : 'bg-accent/20 text-[#dee0fc]'
                  } hover:bg-accent/40`}
                >
                  @{mentionedMember?.user.displayName ?? username}
                </span>
              );
            }
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return (
                <pre className="my-1 overflow-x-auto rounded bg-ec-bg-secondary p-3">
                  <code className="font-mono text-sm text-ec-text-secondary" {...props}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-ec-bg-secondary px-1 py-0.5 font-mono text-sm text-ec-text-secondary" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </span>
  );
}
