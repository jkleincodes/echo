import { useEffect, useRef } from 'react';
import { socketService } from '../services/socketService';

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function useIdleDetection() {
  const isIdle = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function resetIdle() {
      // If we were idle, notify server we're active again
      if (isIdle.current) {
        isIdle.current = false;
        const socket = socketService.getSocket();
        socket?.emit('presence:activity');
      }

      // Reset the idle timer
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isIdle.current = true;
        // Server detects idle via missed heartbeats, but we can also notify explicitly
      }, IDLE_THRESHOLD_MS);
    }

    // Track user activity
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    for (const event of events) {
      window.addEventListener(event, resetIdle, { passive: true });
    }

    // Start the initial timer
    resetIdle();

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetIdle);
      }
      clearTimeout(timeoutRef.current);
    };
  }, []);
}
