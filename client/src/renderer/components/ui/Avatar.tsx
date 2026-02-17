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
  online?: boolean;
  speaking?: boolean;
}

export default function Avatar({ username, avatarUrl, size = 40, showStatus, online, speaking }: AvatarProps) {
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
      {showStatus && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-ec-bg-secondary ${
            online ? 'bg-ec-status-online' : 'bg-ec-status-offline'
          }`}
          style={{ width: size * 0.35, height: size * 0.35 }}
        />
      )}
    </div>
  );
}
