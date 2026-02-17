import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetAllStores, createMockMember, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MentionAutocomplete from '../MentionAutocomplete';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('MentionAutocomplete', () => {
  const members = [
    createMockMember({ userId: 'u1', user: createMockUser({ id: 'u1', username: 'alice', displayName: 'Alice' }) }),
    createMockMember({ userId: 'u2', user: createMockUser({ id: 'u2', username: 'bob', displayName: 'Bob' }) }),
  ];

  it('renders filtered members', () => {
    render(<MentionAutocomplete query="al" members={members} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('renders special mentions @everyone and @here', () => {
    render(<MentionAutocomplete query="" members={members} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('@everyone')).toBeInTheDocument();
    expect(screen.getByText('@here')).toBeInTheDocument();
  });

  it('calls onSelect on member click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MentionAutocomplete query="" members={members} onSelect={onSelect} onClose={vi.fn()} />);
    await user.click(screen.getByText('Alice'));
    expect(onSelect).toHaveBeenCalledWith('alice');
  });

  it('calls onSelect for special mention click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MentionAutocomplete query="" members={members} onSelect={onSelect} onClose={vi.fn()} />);
    await user.click(screen.getByText('@everyone'));
    expect(onSelect).toHaveBeenCalledWith('everyone');
  });

  it('returns null when no matches', () => {
    const { container } = render(<MentionAutocomplete query="xyz" members={members} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('handles keyboard navigation', () => {
    render(<MentionAutocomplete query="" members={members} onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    // Just verify it doesn't crash - keyboard navigation changes selectedIndex
    expect(screen.getByText('@everyone')).toBeInTheDocument();
  });
});
