import { useState, useEffect, useCallback, useRef } from 'react';
import Avatar from '../ui/Avatar';
import type { Member } from '../../../../../shared/types';

interface Props {
  query: string;
  members: Member[];
  onSelect: (username: string) => void;
  onClose: () => void;
}

const SPECIAL_MENTIONS = [
  { id: 'everyone', label: '@everyone', desc: 'Notify all members' },
  { id: 'here', label: '@here', desc: 'Notify online members' },
];

export default function MentionAutocomplete({ query, members, onSelect, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.toLowerCase();
  const filteredSpecials = SPECIAL_MENTIONS.filter(
    (s) => s.id.includes(q) || s.label.includes(q),
  );

  const filtered = members.filter((m) => {
    return (
      m.user.displayName.toLowerCase().includes(q) ||
      m.user.username.toLowerCase().includes(q)
    );
  });

  const totalCount = filteredSpecials.length + filtered.length;

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (totalCount === 0) return;

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex((prev) => (prev <= 0 ? totalCount - 1 : prev - 1));
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex((prev) => (prev >= totalCount - 1 ? 0 : prev + 1));
          break;
        }
        case 'Enter':
        case 'Tab': {
          e.preventDefault();
          if (selectedIndex < filteredSpecials.length) {
            onSelect(filteredSpecials[selectedIndex].id);
          } else {
            const memberIndex = selectedIndex - filteredSpecials.length;
            if (filtered[memberIndex]) {
              onSelect(filtered[memberIndex].user.username);
            }
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [totalCount, filteredSpecials, filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (totalCount === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-full max-w-md overflow-hidden rounded-lg bg-ec-bg-tertiary shadow-lg">
      <div ref={listRef} className="scrollbar-echo max-h-52 overflow-y-auto">
        {filteredSpecials.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs font-semibold uppercase text-ec-text-muted">
              Special
            </div>
            {filteredSpecials.map((special, index) => (
              <button
                key={special.id}
                onClick={() => onSelect(special.id)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left ${
                  index === selectedIndex
                    ? 'bg-ec-bg-modifier-selected'
                    : 'hover:bg-ec-bg-modifier-hover'
                }`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">@</div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-ec-text-primary">{special.label}</span>
                  <span className="ml-2 text-xs text-ec-text-muted">{special.desc}</span>
                </div>
              </button>
            ))}
          </>
        )}
        {filtered.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs font-semibold uppercase text-ec-text-muted">
              Members
            </div>
            {filtered.map((member, index) => {
              const globalIndex = filteredSpecials.length + index;
              return (
                <button
                  key={member.id}
                  onClick={() => onSelect(member.user.username)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left ${
                    globalIndex === selectedIndex
                      ? 'bg-ec-bg-modifier-selected'
                      : 'hover:bg-ec-bg-modifier-hover'
                  }`}
                >
                  <Avatar
                    username={member.user.displayName}
                    avatarUrl={member.user.avatarUrl}
                    size={28}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-ec-text-primary">
                      {member.user.displayName}
                    </span>
                    <span className="ml-2 text-xs text-ec-text-muted">
                      {member.user.username}
                    </span>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
