import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkEmbed from '../LinkEmbed';

const mockWindowOpen = vi.fn();
const originalOpen = window.open;

beforeEach(() => {
  vi.clearAllMocks();
  window.open = mockWindowOpen;
});

afterEach(() => {
  window.open = originalOpen;
});

describe('LinkEmbed', () => {
  const baseEmbed = {
    id: 'e1',
    url: 'https://example.com',
    title: 'Example Site',
    description: 'An example description',
    imageUrl: null,
    siteName: 'Example',
    favicon: null,
  };

  it('renders embed title', () => {
    render(<LinkEmbed embed={baseEmbed} />);
    expect(screen.getByText('Example Site')).toBeInTheDocument();
  });

  it('renders embed description', () => {
    render(<LinkEmbed embed={baseEmbed} />);
    expect(screen.getByText('An example description')).toBeInTheDocument();
  });

  it('renders site name', () => {
    render(<LinkEmbed embed={baseEmbed} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('renders image when provided', () => {
    const embed = { ...baseEmbed, imageUrl: 'https://example.com/img.png' };
    render(<LinkEmbed embed={embed} />);
    const img = document.querySelector('img[src="https://example.com/img.png"]');
    expect(img).toBeInTheDocument();
  });

  it('opens URL on click', async () => {
    const user = userEvent.setup();
    render(<LinkEmbed embed={baseEmbed} />);
    await user.click(screen.getByText('Example Site'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com', '_blank');
  });
});
