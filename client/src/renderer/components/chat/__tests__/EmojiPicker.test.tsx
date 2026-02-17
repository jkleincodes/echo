import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock emoji-mart since it's heavy
vi.mock('@emoji-mart/data', () => ({ default: {} }));
vi.mock('@emoji-mart/react', () => ({
  default: ({ onEmojiSelect }: { onEmojiSelect: (e: { native: string }) => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={() => onEmojiSelect({ native: '😀' })}>😀</button>
    </div>
  ),
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmojiPicker from '../EmojiPicker';

describe('EmojiPicker', () => {
  it('renders the picker', () => {
    render(<EmojiPicker onSelect={vi.fn()} />);
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('calls onSelect with native emoji', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);
    await user.click(screen.getByText('😀'));
    expect(onSelect).toHaveBeenCalledWith('😀');
  });
});
