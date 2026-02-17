import { useState } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Settings } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useVoice } from '../../hooks/useVoice';
import Avatar from '../ui/Avatar';
import UserSettingsModal from '../modals/UserSettingsModal';

export default function UserPanel() {
  const user = useAuthStore((s) => s.user);
  const { connected, muted, deafened, isInAfkChannel, toggleMute, toggleDeafen, leaveVoice } = useVoice();
  const [showSettings, setShowSettings] = useState(false);

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-2 bg-ec-bg-floating/50 px-2 py-1.5">
        <Avatar username={user.displayName} avatarUrl={user.avatarUrl} size={32} showStatus online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ec-text-primary">{user.displayName}</p>
          <p className="truncate text-xs text-ec-text-muted">{user.username}</p>
        </div>

        <div className="flex gap-1">
          {connected && (
            <>
              <button
                onClick={toggleMute}
                disabled={isInAfkChannel}
                className={`rounded p-1.5 ${
                  isInAfkChannel ? 'cursor-not-allowed opacity-40 text-red' : `hover:bg-ec-bg-modifier-hover ${muted ? 'text-red' : 'text-ec-text-secondary'}`
                }`}
                title={isInAfkChannel ? 'Muted in AFK channel' : muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                onClick={toggleDeafen}
                className={`rounded p-1.5 hover:bg-ec-bg-modifier-hover ${
                  deafened ? 'text-red' : 'text-ec-text-secondary'
                }`}
                title={deafened ? 'Undeafen' : 'Deafen'}
              >
                {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
              </button>
            </>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="rounded p-1.5 text-ec-text-secondary hover:bg-ec-bg-modifier-hover hover:text-ec-text-primary"
            title="User Settings"
          >
            <Settings size={18} />
          </button>
          {connected && (
            <button
              onClick={leaveVoice}
              className="rounded bg-red/20 p-1.5 text-red hover:bg-red/30"
              title="Disconnect"
            >
              <PhoneOff size={18} />
            </button>
          )}
        </div>
      </div>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
