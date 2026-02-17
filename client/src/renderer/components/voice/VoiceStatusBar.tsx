import { Mic, MicOff, Headphones, HeadphoneOff, Signal, Video, VideoOff, Monitor, MonitorOff, LayoutGrid, AudioLines } from 'lucide-react';
import { useVoice } from '../../hooks/useVoice';
import { useServerStore } from '../../stores/serverStore';
import { useSoundboardStore } from '../../stores/soundboardStore';
import ScreenSharePicker from './ScreenSharePicker';
import SoundboardPanel from './SoundboardPanel';

export default function VoiceStatusBar() {
  const { connected, channelId, muted, deafened, cameraOn, screenSharing, screenSharePickerOpen, videoOverlayOpen, isInAfkChannel, toggleMute, toggleDeafen, toggleCamera, toggleScreenShare, startScreenShare, setScreenSharePickerOpen, setVideoOverlayOpen } = useVoice();
  const channels = useServerStore((s) => s.channels);
  const { soundboardOpen, setSoundboardOpen } = useSoundboardStore();

  if (!connected || !channelId) return null;

  const channel = channels.find((c) => c.id === channelId);

  return (
    <div className="flex items-center justify-between bg-ec-bg-secondary px-4 py-2 shadow-lg">
      <div className="flex items-center gap-2">
        <Signal size={16} className="text-green" />
        <div>
          <p className="text-sm font-medium text-green">Voice Connected</p>
          {channel && <p className="text-xs text-ec-text-muted">{channel.name}{isInAfkChannel ? ' (AFK)' : ''}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={toggleCamera}
          disabled={isInAfkChannel}
          className={`rounded p-1.5 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 text-ec-text-muted' : cameraOn ? 'bg-green/20 text-green' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={isInAfkChannel ? 'Disabled in AFK channel' : cameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          onClick={toggleScreenShare}
          disabled={isInAfkChannel}
          className={`rounded p-1.5 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 text-ec-text-muted' : screenSharing ? 'bg-green/20 text-green' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={isInAfkChannel ? 'Disabled in AFK channel' : screenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {screenSharing ? <Monitor size={18} /> : <MonitorOff size={18} />}
        </button>
        <button
          onClick={() => setSoundboardOpen(!soundboardOpen)}
          disabled={isInAfkChannel}
          className={`rounded p-1.5 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 text-ec-text-muted' : soundboardOpen ? 'bg-dc-accent/20 text-dc-accent' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={isInAfkChannel ? 'Disabled in AFK channel' : 'Soundboard'}
        >
          <AudioLines size={18} />
        </button>
        <button
          onClick={toggleMute}
          disabled={isInAfkChannel}
          className={`rounded p-1.5 ${isInAfkChannel ? 'cursor-not-allowed opacity-40 text-red' : muted ? 'bg-red/20 text-red' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={isInAfkChannel ? 'Muted in AFK channel' : muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          onClick={toggleDeafen}
          className={`rounded p-1.5 ${deafened ? 'bg-red/20 text-red' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={deafened ? 'Undeafen' : 'Deafen'}
        >
          {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </button>
        <button
          onClick={() => setVideoOverlayOpen(!videoOverlayOpen)}
          className={`rounded p-1.5 ${videoOverlayOpen ? 'bg-dc-accent/20 text-dc-accent' : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover'}`}
          title={videoOverlayOpen ? 'Hide video panel' : 'Show video panel'}
        >
          <LayoutGrid size={18} />
        </button>
      </div>

      {screenSharePickerOpen && (
        <ScreenSharePicker onSelect={startScreenShare} onClose={() => setScreenSharePickerOpen(false)} />
      )}
      {soundboardOpen && (
        <SoundboardPanel onClose={() => setSoundboardOpen(false)} />
      )}
    </div>
  );
}
