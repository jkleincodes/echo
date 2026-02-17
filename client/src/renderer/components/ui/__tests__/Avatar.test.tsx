import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from '../Avatar';

describe('Avatar', () => {
  it('shows initial letter (uppercase) when no avatarUrl', () => {
    render(<Avatar username="alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows img with src when avatarUrl provided', () => {
    render(<Avatar username="alice" avatarUrl="https://example.com/avatar.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('uses alt text as username', () => {
    render(<Avatar username="bob" avatarUrl="https://example.com/avatar.png" />);
    const img = screen.getByAltText('bob');
    expect(img).toBeInTheDocument();
  });

  it('shows status indicator when showStatus=true', () => {
    const { container } = render(<Avatar username="alice" showStatus online />);
    const statusDot = container.querySelector('.absolute.-bottom-0\\.5.-right-0\\.5');
    expect(statusDot).not.toBeNull();
  });

  it('no status indicator when showStatus=false (default)', () => {
    const { container } = render(<Avatar username="alice" />);
    const statusDots = container.querySelectorAll('[class*="absolute"]');
    // The only element with absolute could be the status dot; it should not exist
    const hasBg = Array.from(statusDots).some(
      (el) => el.className.includes('bg-ec-status-online') || el.className.includes('bg-ec-status-offline'),
    );
    expect(hasBg).toBe(false);
  });

  it('applies speaking border style when speaking=true on fallback avatar', () => {
    const { container } = render(<Avatar username="alice" speaking />);
    const fallback = container.querySelector('.rounded-full.font-semibold');
    expect(fallback).not.toBeNull();
    expect(fallback).toHaveStyle({ border: '2px solid #23a559' });
  });

  it('applies speaking border style when speaking=true on image avatar', () => {
    render(<Avatar username="alice" avatarUrl="https://example.com/a.png" speaking />);
    const img = screen.getByRole('img');
    expect(img).toHaveStyle({ border: '2px solid #23a559' });
  });

  it('does not apply speaking border when speaking is false', () => {
    const { container } = render(<Avatar username="alice" />);
    const fallback = container.querySelector('.rounded-full.font-semibold');
    expect(fallback).not.toBeNull();
    expect(fallback).toHaveStyle({ border: 'none' });
  });

  it('default size is 40', () => {
    const { container } = render(<Avatar username="alice" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('40px');
    expect(wrapper.style.height).toBe('40px');
  });

  it('custom size is applied', () => {
    const { container } = render(<Avatar username="alice" size={64} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('64px');
    expect(wrapper.style.height).toBe('64px');
  });
});
