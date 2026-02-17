import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface Props {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  direction?: 'up' | 'down';
}

export default function EmojiPicker({ onSelect, onClose, direction = 'down' }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const pickerWidth = 352;
    const pickerHeight = 435;
    let top: number;
    let left = rect.right - pickerWidth;
    if (left < 0) left = 4;

    if (direction === 'up') {
      top = rect.top - pickerHeight - 8;
      if (top < 0) top = 4;
    } else {
      top = rect.bottom + 8;
      if (top + pickerHeight > window.innerHeight) {
        top = rect.top - pickerHeight - 8;
      }
    }

    setPos({ top, left });
  }, [direction]);

  // Close on click outside the picker
  useEffect(() => {
    if (!onClose || !pos) return;
    const handleMouseDown = (e: MouseEvent) => {
      const pickerEl = pickerRef.current;
      if (!pickerEl) return;
      // Check if click is inside the picker container (including shadow DOM children)
      if (pickerEl.contains(e.target as Node)) return;
      onClose();
    };
    // Use setTimeout so the opening click doesn't immediately close it
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose, pos]);

  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {pos &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[9999]"
            style={{ top: pos.top, left: pos.left }}
          >
            <Picker
              data={data}
              onEmojiSelect={(emoji: { native: string }) => onSelect(emoji.native)}
              theme="dark"
              previewPosition="none"
              skinTonePosition="none"
              set="native"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
