import { useRef, useEffect } from 'react';
import { Volume2, VolumeOff } from 'lucide-react';
import Avatar from '../ui/Avatar';

interface VideoTileProps {
  userId: string;
  stream: MediaStream | null;
  label: string;
  avatarUrl?: string | null;
  featured?: boolean;
  mirrored?: boolean;
  screenAudioMuted?: boolean;
  onScreenAudioToggle?: () => void;
}

export default function VideoTile({ userId, stream, label, avatarUrl, featured, mirrored, screenAudioMuted, onScreenAudioToggle }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-ec-bg-tertiary ${featured ? 'h-full w-full' : 'aspect-video'}`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full ${featured ? 'object-contain' : 'object-cover'} ${mirrored ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar username={label} avatarUrl={avatarUrl ?? null} size={featured ? 80 : 48} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
        <span className="text-xs font-medium text-white">{label}</span>
        {onScreenAudioToggle && (
          <button
            onClick={onScreenAudioToggle}
            className="rounded p-1 text-white/80 hover:text-white"
            title={screenAudioMuted ? 'Unmute screen audio' : 'Mute screen audio'}
          >
            {screenAudioMuted ? <VolumeOff size={16} /> : <Volume2 size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
