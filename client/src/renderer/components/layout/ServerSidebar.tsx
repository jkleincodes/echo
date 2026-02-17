import { useState } from 'react';
import { Plus, MessageCircle, ArrowDownToLine } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useNotificationStore } from '../../stores/notificationStore';
import CreateServerModal from '../modals/CreateServerModal';
import JoinServerModal from '../modals/JoinServerModal';
import { getServerUrl } from '../../lib/serverUrl';

export default function ServerSidebar() {
  const { servers, activeServerId, showHome, setActiveServer, setShowHome } = useServerStore();
  const unreads = useUnreadStore((s) => s.unreads);
  const notificationStore = useNotificationStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const getServerUnread = (serverId: string) => {
    let totalCount = 0;
    let totalMentions = 0;
    for (const [, info] of unreads) {
      if (info.serverId === serverId) {
        totalCount += info.count;
        totalMentions += info.mentionCount;
      }
    }
    return { totalCount, totalMentions };
  };

  const getDMUnread = () => {
    let totalCount = 0;
    for (const [, info] of unreads) {
      if (info.serverId === null) {
        totalCount += info.count;
      }
    }
    return { totalCount };
  };

  const dmUnread = getDMUnread();

  return (
    <>
      <div className="scrollbar-echo flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-ec-bg-tertiary py-3">
        {/* Home / DM button */}
        <div className="relative flex items-center justify-center">
          <div
            className={`absolute -left-1.5 w-1 rounded-r-full bg-ec-text-primary transition-all ${
              showHome ? 'h-10' : 'h-0'
            }`}
          />
          <button
            onClick={() => setShowHome(true)}
            className={`relative flex h-12 w-12 items-center justify-center transition-all ${
              showHome
                ? 'rounded-lg bg-accent text-white'
                : 'rounded-xl bg-ec-bg-primary text-ec-text-primary hover:rounded-lg hover:bg-accent hover:text-white'
            }`}
            title="Direct Messages"
          >
            <MessageCircle size={24} />
            {dmUnread.totalCount > 0 && (
              <span className="absolute -bottom-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-ec-bg-tertiary">
                {dmUnread.totalCount > 99 ? '99+' : dmUnread.totalCount}
              </span>
            )}
          </button>
        </div>

        {/* Separator */}
        <div className="mx-auto h-0.5 w-8 rounded-full bg-ec-bg-modifier-active" />

        {servers.map((server) => {
          const isActive = server.id === activeServerId && !showHome;
          const initial = server.name.charAt(0).toUpperCase();
          const { totalCount, totalMentions } = getServerUnread(server.id);
          const hasUnread = totalCount > 0;
          const hasMentions = totalMentions > 0;
          const isServerMuted = notificationStore.isServerMuted(server.id);

          return (
            <div key={server.id} className="relative flex items-center justify-center">
              {/* Active indicator or unread dot */}
              <div
                className={`absolute -left-1.5 w-1 rounded-r-full transition-all ${
                  isActive
                    ? 'h-10 bg-ec-text-primary'
                    : hasUnread
                      ? 'h-2 bg-ec-text-primary'
                      : 'h-0 group-hover:h-5'
                } ${!isActive ? 'bg-ec-text-primary' : ''}`}
              />
              <button
                onClick={() => setActiveServer(server.id)}
                className={`relative flex h-12 w-12 items-center justify-center overflow-hidden text-lg font-semibold transition-all ${
                  isActive
                    ? server.iconUrl ? 'rounded-lg' : 'rounded-lg bg-accent text-white'
                    : server.iconUrl ? 'rounded-xl hover:rounded-lg' : 'rounded-xl bg-ec-bg-primary text-ec-text-primary hover:rounded-lg hover:bg-accent hover:text-white'
                } ${isServerMuted ? 'opacity-50' : ''}`}
                title={server.name}
              >
                {server.iconUrl ? (
                  <img src={server.iconUrl.startsWith('http') ? server.iconUrl : getServerUrl() + server.iconUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
                {hasMentions && (
                  <span className="absolute -bottom-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-ec-bg-tertiary">
                    {totalMentions > 99 ? '99+' : totalMentions}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Separator */}
        <div className="mx-auto h-0.5 w-8 rounded-full bg-ec-bg-modifier-active" />

        {/* Add server button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-ec-bg-primary text-green transition-all hover:rounded-lg hover:bg-green hover:text-white"
          title="Add a Server"
        >
          <Plus size={24} />
        </button>

        {/* Join server button */}
        <button
          onClick={() => setShowJoinModal(true)}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-ec-bg-primary text-green transition-all hover:rounded-lg hover:bg-green hover:text-white"
          title="Join a Server"
        >
          <ArrowDownToLine size={24} />
        </button>
      </div>

      {showCreateModal && <CreateServerModal onClose={() => setShowCreateModal(false)} />}
      {showJoinModal && <JoinServerModal onClose={() => setShowJoinModal(false)} />}
    </>
  );
}
