import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockUser, createMockMember } from '../../../__tests__/mocks/stores.mock';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import { useServerStore } from '../../../stores/serverStore';
import FormattedContent from '../FormattedContent';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  useAuthStore.setState({ user: createMockUser({ id: 'u1' }), token: 'tok' });
});

describe('FormattedContent', () => {
  it('renders plain text', () => {
    render(<FormattedContent content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<FormattedContent content="**bold**" />);
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('renders links', () => {
    render(<FormattedContent content="Check [this](https://example.com)" />);
    const link = screen.getByText('this');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('renders spoilers hidden initially', () => {
    render(<FormattedContent content="This is ||spoiler||" />);
    const spoiler = screen.getByText('spoiler');
    expect(spoiler).toHaveClass('text-transparent');
  });

  it('reveals spoiler on click', async () => {
    const user = userEvent.setup();
    render(<FormattedContent content="||secret||" />);
    const spoiler = screen.getByText('secret');
    await user.click(spoiler);
    expect(spoiler).not.toHaveClass('text-transparent');
  });

  it('renders @mentions with styling', () => {
    const member = createMockMember({
      userId: 'u2',
      user: createMockUser({ id: 'u2', username: 'alice', displayName: 'Alice' }),
    });
    useServerStore.setState({ members: [member] });
    render(<FormattedContent content="Hey @alice check this" />);
    expect(screen.getByText('@Alice')).toBeInTheDocument();
  });
});
