import { Download, FileText } from 'lucide-react';
import type { Attachment } from '../../../../../shared/types';
import { getServerUrl } from '../../lib/serverUrl';

interface Props {
  attachments: Attachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export default function AttachmentDisplay({ attachments }: Props) {
  if (!attachments.length) return null;

  return (
    <div className="mt-1 flex flex-col gap-1">
      {attachments.map((att) => {
        const fullUrl = `${getServerUrl()}${att.url}`;

        if (isImage(att.mimeType)) {
          return (
            <a
              key={att.id}
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={fullUrl}
                alt={att.filename}
                className="max-h-[300px] max-w-[400px] rounded-lg object-contain"
                loading="lazy"
              />
            </a>
          );
        }

        return (
          <a
            key={att.id}
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-ec-bg-modifier-hover bg-ec-bg-secondary p-3 hover:bg-ec-bg-modifier-hover"
            style={{ maxWidth: 400 }}
          >
            <FileText size={32} className="shrink-0 text-ec-text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ec-text-link hover:underline">{att.filename}</p>
              <p className="text-xs text-ec-text-muted">{formatSize(att.size)}</p>
            </div>
            <Download size={20} className="shrink-0 text-ec-text-muted" />
          </a>
        );
      })}
    </div>
  );
}
