import { useState, useRef, useEffect } from 'react';
import { Check, Smile } from 'lucide-react';
import { socketService } from '../../services/socketService';
import { useAuthStore } from '../../stores/authStore';
import CustomStatusModal from '../modals/CustomStatusModal';
import type { UserStatus } from '../../../../../shared/types';

const STATUS_OPTIONS: { status: UserStatus; label: string; description?: string; icon: React.ReactNode }[] = [
  {
    status: 'online',
    label: 'Online',
    icon: <svg viewBox="0 0 12 12" width={12} height={12}><circle cx="6" cy="6" r="5" fill="var(--color-ec-status-online)" /></svg>,
  },
  {
    status: 'idle',
    label: 'Idle',
    icon: (
      <svg viewBox="0 0 12 12" width={12} height={12}>
        <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5a3.375 3.375 0 0 0 4.5 4.5Z" fill="var(--color-ec-status-idle)" />
      </svg>
    ),
  },
  {
    status: 'dnd',
    label: 'Do Not Disturb',
    description: 'You will not receive any notifications.',
    icon: (
      <svg viewBox="0 0 12 12" width={12} height={12}>
        <circle cx="6" cy="6" r="5" fill="var(--color-ec-status-dnd)" />
        <rect x="3" y="5" width="6" height="2" rx="1" fill="white" />
      </svg>
    ),
  },
  {
    status: 'invisible',
    label: 'Invisible',
    description: 'You will appear offline to others.',
    icon: (
      <svg viewBox="0 0 12 12" width={12} height={12}>
        <circle cx="6" cy="6" r="5" fill="var(--color-ec-status-offline)" />
        <circle cx="6" cy="6" r="2.5" fill="var(--color-ec-bg-floating)" />
      </svg>
    ),
  },
];

interface StatusPickerProps {
  onClose: () => void;
}

export default function StatusPicker({ onClose }: StatusPickerProps) {
  const user = useAuthStore((s) => s.user);
  const [showCustomStatus, setShowCustomStatus] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showCustomStatus) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, showCustomStatus]);

  const handleSetStatus = (status: UserStatus) => {
    const socket = socketService.getSocket();
    socket?.emit('presence:set-status', { status });
    if (user) {
      useAuthStore.setState({ user: { ...user, status } });
    }
    onClose();
  };

  const currentStatus = user?.status ?? 'online';

  return (
    <>
      <div
        ref={ref}
        className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg bg-ec-bg-floating p-1.5 shadow-xl"
      >
        {/* Custom status button */}
        <button
          onClick={() => setShowCustomStatus(true)}
          className="mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-ec-text-primary hover:bg-ec-bg-modifier-hover"
        >
          <Smile size={14} className="text-ec-text-muted" />
          <span>{user?.customStatus ? 'Edit Custom Status' : 'Set Custom Status'}</span>
        </button>

        <div className="my-1 border-t border-ec-bg-tertiary" />

        {/* Status options */}
        {STATUS_OPTIONS.map((option) => (
          <div key={option.status}>
            <button
              onClick={() => handleSetStatus(option.status)}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-ec-text-primary hover:bg-ec-bg-modifier-hover"
            >
              <span className="flex shrink-0 items-center">{option.icon}</span>
              <span className="flex-1">{option.label}</span>
              {currentStatus === option.status && (
                <Check size={14} className="text-ec-text-muted" />
              )}
            </button>
            {option.description && (
              <p className="px-9 pb-1 text-xs text-ec-text-muted">{option.description}</p>
            )}
          </div>
        ))}
      </div>

      {showCustomStatus && (
        <CustomStatusModal
          onClose={() => {
            setShowCustomStatus(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
