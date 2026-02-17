import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/api.mock';
import { mockSocket } from '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen, fireEvent } from '@testing-library/react';
import DMMessageInput from '../DMMessageInput';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('DMMessageInput', () => {
  it('renders textarea with correct placeholder', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    expect(screen.getByPlaceholderText('Message @Alice')).toBeInTheDocument();
  });

  it('sends message on Enter key press', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');
    fireEvent.change(textarea, { target: { value: 'Hello Alice' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'dm:send',
      { channelId: 'dm-1', content: 'Hello Alice' },
      expect.any(Function),
    );
  });

  it('clears input after sending', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(textarea.value).toBe('');
  });

  it('does not send on Shift+Enter', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');
    fireEvent.change(textarea, { target: { value: 'Line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'dm:send',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not send empty message', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'dm:send',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not send whitespace-only message', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'dm:send',
      expect.anything(),
      expect.anything(),
    );
  });

  it('emits dm:typing-start on input change', () => {
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');
    fireEvent.change(textarea, { target: { value: 'H' } });
    expect(mockSocket.emit).toHaveBeenCalledWith('dm:typing-start', { channelId: 'dm-1' });
  });

  it('throttles typing emit to 3 seconds', () => {
    vi.useFakeTimers();
    renderWithRouter(<DMMessageInput channelId="dm-1" recipientName="Alice" />);
    const textarea = screen.getByPlaceholderText('Message @Alice');

    // First character triggers typing emit
    fireEvent.change(textarea, { target: { value: 'A' } });
    const typingCalls = mockSocket.emit.mock.calls.filter(
      ([event]: [string]) => event === 'dm:typing-start',
    );
    expect(typingCalls).toHaveLength(1);

    // Typing more within 3 seconds should NOT emit again
    fireEvent.change(textarea, { target: { value: 'AB' } });
    fireEvent.change(textarea, { target: { value: 'ABC' } });
    const typingCallsAfter = mockSocket.emit.mock.calls.filter(
      ([event]: [string]) => event === 'dm:typing-start',
    );
    expect(typingCallsAfter).toHaveLength(1);

    // After 3 seconds, typing should emit again
    vi.advanceTimersByTime(3100);
    fireEvent.change(textarea, { target: { value: 'ABCD' } });
    const typingCallsFinal = mockSocket.emit.mock.calls.filter(
      ([event]: [string]) => event === 'dm:typing-start',
    );
    expect(typingCallsFinal).toHaveLength(2);

    vi.useRealTimers();
  });

  it('resets content when channelId changes', () => {
    const { rerender } = renderWithRouter(
      <DMMessageInput channelId="dm-1" recipientName="Alice" />,
    );
    const textarea = screen.getByPlaceholderText('Message @Alice') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Draft message' } });
    expect(textarea.value).toBe('Draft message');

    // Change channel
    rerender(
      <DMMessageInput channelId="dm-2" recipientName="Bob" />,
    );
    const newTextarea = screen.getByPlaceholderText('Message @Bob') as HTMLTextAreaElement;
    expect(newTextarea.value).toBe('');
  });

  it('updates placeholder when recipientName changes', () => {
    const { rerender } = renderWithRouter(
      <DMMessageInput channelId="dm-1" recipientName="Alice" />,
    );
    expect(screen.getByPlaceholderText('Message @Alice')).toBeInTheDocument();

    rerender(<DMMessageInput channelId="dm-1" recipientName="Bob" />);
    expect(screen.getByPlaceholderText('Message @Bob')).toBeInTheDocument();
  });
});
