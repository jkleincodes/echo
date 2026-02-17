import { Video, VideoOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { useVoice } from '../../hooks/useVoice';
import { useVoiceStore } from '../../stores/voiceStore';
import { useServerStore } from '../../stores/serverStore';
import { useAuthStore } from '../../stores/authStore';
import VideoTile from './VideoTile';
import ScreenSharePicker from './ScreenSharePicker';
import type { ProducerMediaType } from '../../../../../shared/types';

interface TileEntry {
  userId: string;
  stream: MediaStream | null;
  mediaType: ProducerMediaType;
  label: string;
  avatarUrl?: string | null;
  mirrored?: boolean;
}

export default function VideoOverlay() {
  const { cameraOn, screenSharing, screenSharePickerOpen, screenAudioMuted, isInAfkChannel, toggleCamera, toggleScreenShare, startScreenShare, toggleScreenAudioMute, setScreenSharePickerOpen, leaveVoice } = useVoice();
  const remoteVideoStreams = useVoiceStore((s) => s.remoteVideoStreams);
  const localVideoStream = useVoiceStore((s) => s.localVideoStream);
  const localScreenStream = useVoiceStore((s) => s.localScreenStream);
  const members = useServerStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUser = useAuthStore((s) => s.user);

  // Build tile list
  const tiles: TileEntry[] = [];
  let screenShareTile: TileEntry | null = null;

  // Local camera
  if (cameraOn && localVideoStream) {
    tiles.push({
      userId: currentUserId || 'local',
      stream: localVideoStream,
      mediaType: 'video',
      label: currentUser?.displayName || 'You',
      avatarUrl: currentUser?.avatarUrl,
      mirrored: true,
    });
  }

  // Local screen share
  if (screenSharing && localScreenStream) {
    screenShareTile = {
      userId: currentUserId || 'local',
      stream: localScreenStream,
      mediaType: 'screen',
      label: `${currentUser?.displayName || 'You'}'s screen`,
      avatarUrl: currentUser?.avatarUrl,
    };
  }

  // Remote streams
  for (const [userId, userStreams] of remoteVideoStreams) {
    const member = members.find((m) => m.userId === userId);
    const displayName = member?.user.displayName || userId;
    const avatarUrl = member?.user.avatarUrl || null;

    for (const [mediaType, stream] of userStreams) {
      if (mediaType === 'screen') {
        screenShareTile = {
          userId,
          stream,
          mediaType: 'screen',
          label: `${displayName}'s screen`,
          avatarUrl,
        };
      } else if (mediaType === 'video') {
        tiles.push({
          userId,
          stream,
          mediaType: 'video',
          label: displayName,
          avatarUrl,
        });
      }
    }
  }

  const hasContent = tiles.length > 0 || screenShareTile;

  // Grid columns for camera-only layout
  const getGridCols = (count: number) => {
    if (count <= 1) return 'grid-cols-1';
    if (count <= 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  return (
    <div className="flex flex-1 flex-col bg-ec-bg-primary">
      {/* Video area */}
      <div className="flex flex-1 overflow-hidden p-4">
        {!hasContent ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-ec-text-secondary">No one has their camera on</p>
              <p className="mt-1 text-sm text-ec-text-muted">Turn on your camera or share your screen to get started</p>
            </div>
          </div>
        ) : screenShareTile ? (
          // Screen share layout: featured screen + small tiles on right
          <div className="flex flex-1 gap-4">
            <div className="flex-1">
              <VideoTile
                userId={screenShareTile.userId}
                stream={screenShareTile.stream}
                label={screenShareTile.label}
                avatarUrl={screenShareTile.avatarUrl}
                featured
                screenAudioMuted={screenShareTile.userId !== currentUserId ? (screenAudioMuted.get(screenShareTile.userId) ?? false) : undefined}
                onScreenAudioToggle={screenShareTile.userId !== currentUserId ? () => toggleScreenAudioMute(screenShareTile!.userId) : undefined}
              />
            </div>
            {tiles.length > 0 && (
              <div className="flex w-48 flex-col gap-2 overflow-y-auto">
                {tiles.map((tile) => (
                  <VideoTile
                    key={`${tile.userId}-${tile.mediaType}`}
                    userId={tile.userId}
                    stream={tile.stream}
                    label={tile.label}
                    avatarUrl={tile.avatarUrl}
                    mirrored={tile.mirrored}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          // Camera-only grid layout
          <div className={`grid flex-1 gap-4 ${getGridCols(tiles.length)} auto-rows-fr`}>
            {tiles.map((tile) => (
              <VideoTile
                key={`${tile.userId}-${tile.mediaType}`}
                userId={tile.userId}
                stream={tile.stream}
                label={tile.label}
                avatarUrl={tile.avatarUrl}
                mirrored={tile.mirrored}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div className="flex items-center justify-center gap-3 border-t border-ec-bg-tertiary bg-ec-bg-secondary px-4 py-3">
        <button
          onClick={toggleCamera}
          disabled={isInAfkChannel}
          className={`rounded-full p-3 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 bg-ec-bg-tertiary text-ec-text-muted' : cameraOn ? 'bg-ec-bg-modifier-hover text-ec-text-primary' : 'bg-ec-bg-tertiary text-ec-text-muted hover:text-ec-text-secondary'}`}
          title={isInAfkChannel ? 'Disabled in AFK channel' : cameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button
          onClick={toggleScreenShare}
          disabled={isInAfkChannel}
          className={`rounded-full p-3 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 bg-ec-bg-tertiary text-ec-text-muted' : screenSharing ? 'bg-ec-bg-modifier-hover text-ec-text-primary' : 'bg-ec-bg-tertiary text-ec-text-muted hover:text-ec-text-secondary'}`}
          title={isInAfkChannel ? 'Disabled in AFK channel' : screenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {screenSharing ? <Monitor size={20} /> : <MonitorOff size={20} />}
        </button>
        <button
          onClick={leaveVoice}
          className="rounded-full bg-red p-3 text-white hover:bg-red/80"
          title="Disconnect"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      {screenSharePickerOpen && (
        <ScreenSharePicker onSelect={startScreenShare} onClose={() => setScreenSharePickerOpen(false)} />
      )}
    </div>
  );
}
