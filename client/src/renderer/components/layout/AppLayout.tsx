import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useServerStore } from '../../stores/serverStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import ServerSidebar from './ServerSidebar';
import ChannelSidebar from './ChannelSidebar';
import MemberSidebar from './MemberSidebar';
import ChatArea from '../chat/ChatArea';
import VoiceStatusBar from '../voice/VoiceStatusBar';
import VideoOverlay from '../voice/VideoOverlay';
import TitleBar from './TitleBar';
import DMSidebar from '../dm/DMSidebar';
import DMChatArea from '../dm/DMChatArea';
import Avatar from '../ui/Avatar';
import UserSettingsModal from '../modals/UserSettingsModal';

export default function AppLayout() {
  useSocket();
  const { activeServerId, showHome, fetchServers } = useServerStore();
  const voiceConnected = useVoiceStore((s) => s.connected);
  const videoOverlayOpen = useVoiceStore((s) => s.videoOverlayOpen);
  const fetchNotificationPrefs = useNotificationStore((s) => s.fetchAll);
  const user = useAuthStore((s) => s.user);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchServers();
    fetchNotificationPrefs();
  }, [fetchServers, fetchNotificationPrefs]);

  const showCompactUserButton = !activeServerId && !showHome;

  const renderContent = () => {
    if (showHome) {
      return (
        <>
          <DMSidebar />
          <DMChatArea />
        </>
      );
    }

    if (activeServerId) {
      // When video overlay is open and connected to voice, show video panel instead of chat
      if (voiceConnected && videoOverlayOpen) {
        return (
          <>
            <ChannelSidebar />
            <VideoOverlay />
          </>
        );
      }

      return (
        <>
          <ChannelSidebar />
          <ChatArea />
          <MemberSidebar />
        </>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center bg-ec-bg-primary">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-semibold text-ec-text-primary">Welcome to Echo</h2>
          <p className="text-ec-text-secondary">Select a server or create a new one to get started</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="relative flex flex-1 overflow-hidden">
        <ServerSidebar />
        {renderContent()}
        {showCompactUserButton && user && (
          <>
            <button
              onClick={() => setShowSettings(true)}
              className="absolute bottom-3 left-0 z-10 flex w-[72px] justify-center"
              title="User Settings"
            >
              <Avatar username={user.displayName} avatarUrl={user.avatarUrl} size={40} showStatus online />
            </button>
            {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
          </>
        )}
      </div>
      <VoiceStatusBar />
    </div>
  );
}
