import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TitleBar from '../TitleBar';

describe('TitleBar', () => {
  it('renders Echo text', () => {
    render(<TitleBar />);
    expect(screen.getByText('Echo')).toBeInTheDocument();
  });

  it('applies mac padding when platform is darwin', () => {
    (window as any).electronAPI = { platform: 'darwin' };
    const { container } = render(<TitleBar />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.paddingLeft).toBe('78px');
  });

  it('applies non-mac padding when platform is not darwin', () => {
    (window as any).electronAPI = { platform: 'win32' };
    const { container } = render(<TitleBar />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.paddingLeft).toBe('8px');
  });
});
