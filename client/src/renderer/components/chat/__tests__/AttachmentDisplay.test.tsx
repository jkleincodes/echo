import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AttachmentDisplay from '../AttachmentDisplay';

describe('AttachmentDisplay', () => {
  it('returns null for empty attachments', () => {
    const { container } = render(<AttachmentDisplay attachments={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders images for image attachments', () => {
    const attachments = [{ id: 'a1', filename: 'photo.png', url: '/uploads/photo.png', mimeType: 'image/png', size: 1024 }];
    render(<AttachmentDisplay attachments={attachments} />);
    const img = screen.getByAltText('photo.png');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('renders file display for non-image attachments', () => {
    const attachments = [{ id: 'a1', filename: 'doc.pdf', url: '/uploads/doc.pdf', mimeType: 'application/pdf', size: 2048 }];
    render(<AttachmentDisplay attachments={attachments} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
  });

  it('formats file size correctly', () => {
    const attachments = [{ id: 'a1', filename: 'big.zip', url: '/uploads/big.zip', mimeType: 'application/zip', size: 1048576 }];
    render(<AttachmentDisplay attachments={attachments} />);
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('renders download link for files', () => {
    const attachments = [{ id: 'a1', filename: 'doc.pdf', url: '/uploads/doc.pdf', mimeType: 'application/pdf', size: 512 }];
    render(<AttachmentDisplay attachments={attachments} />);
    const link = screen.getByText('doc.pdf').closest('a');
    expect(link).toHaveAttribute('href', 'http://localhost:3001/uploads/doc.pdf');
  });
});
