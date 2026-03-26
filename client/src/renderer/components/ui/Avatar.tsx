import type { UserStatus } from '../../../../../shared/types';
import { getServerUrl } from '../../lib/serverUrl';

function resolveUrl(url: string) {
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return getServerUrl() + url;
}

const COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#009688', '#4caf50', '#ff9800', '#ff5722',
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  showStatus?: boolean;
  status?: UserStatus;
  speaking?: boolean;
}

function StatusIndicator({ status, size }: { status: UserStatus; size: number }) {
  const indicatorSize = size * 0.35;
  const borderWidth = 3;

  if (status === 'online') {
    return (
      <div
        className="absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-ec-bg-secondary bg-ec-status-online"
        style={{ width: indicatorSize, height: indicatorSize }}
      />
    );
  }

  if (status === 'idle') {
    return (
      <div
        className="absolute -bottom-0.5 -right-0.5"
        style={{ width: indicatorSize, height: indicatorSize }}
      >
        <svg viewBox="0 0 16 16" width={indicatorSize} height={indicatorSize}>
          <circle cx="8" cy="8" r="8" fill="var(--color-ec-bg-secondary)" />
          <path
            d="M14 8A6 6 0 1 1 8 2a4.5 4.5 0 0 0 6 6Z"
            fill="var(--color-ec-status-idle)"
          />
        </svg>
      </div>
    );
  }

  if (status === 'dnd') {
    return (
      <div
        className="absolute -bottom-0.5 -right-0.5"
        style={{ width: indicatorSize, height: indicatorSize }}
      >
        <svg viewBox="0 0 16 16" width={indicatorSize} height={indicatorSize}>
          <circle cx="8" cy="8" r="8" fill="var(--color-ec-bg-secondary)" />
          <circle cx="8" cy="8" r="6" fill="var(--color-ec-status-dnd)" />
          <rect x="4" y="6.5" width="8" height="3" rx="1.5" fill="var(--color-ec-bg-secondary)" />
        </svg>
      </div>
    );
  }

  // offline / invisible
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5"
      style={{ width: indicatorSize, height: indicatorSize }}
    >
      <svg viewBox="0 0 16 16" width={indicatorSize} height={indicatorSize}>
        <circle cx="8" cy="8" r="8" fill="var(--color-ec-bg-secondary)" />
        <circle cx="8" cy="8" r="6" fill="var(--color-ec-status-offline)" />
        <circle cx="8" cy="8" r="3" fill="var(--color-ec-bg-secondary)" />
      </svg>
    </div>
  );
}

export default function Avatar({ username, avatarUrl, size = 40, showStatus, status = 'offline', speaking }: AvatarProps) {
  const initial = username.charAt(0).toUpperCase();
  const color = getColor(username);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img
          src={resolveUrl(avatarUrl)}
          alt={username}
          className="h-full w-full rounded-full object-cover"
          style={{ border: speaking ? '2px solid #23a559' : 'none' }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{
            backgroundColor: color,
            fontSize: size * 0.4,
            border: speaking ? '2px solid #23a559' : 'none',
          }}
        >
          {initial}
        </div>
      )}
      {showStatus && <StatusIndicator status={status} size={size} />}
    </div>
  );
}
