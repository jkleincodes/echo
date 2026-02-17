import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
}

const DISMISSED_KEY = 'update-toast-dismissed-version';

export default function UpdateToast() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdateAvailable?.((data) => {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed === data.version) return;
      setUpdate(data);
      setVisible(true);
    });
    return () => { cleanup?.(); };
  }, []);

  const handleDismiss = () => {
    if (update) {
      localStorage.setItem(DISMISSED_KEY, update.version);
    }
    setVisible(false);
  };

  const handleDownload = () => {
    if (update?.downloadUrl) {
      window.electronAPI?.openExternal?.(update.downloadUrl);
    }
  };

  if (!visible || !update) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg bg-ec-bg-secondary shadow-lg border border-ec-bg-modifier-accent">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0 mt-0.5 rounded-full bg-accent/20 p-2">
          <Download size={16} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ec-text-primary">
            Update Available — v{update.version}
          </p>
          {update.releaseNotes && (
            <p className="mt-1 text-xs text-ec-text-secondary line-clamp-2">
              {update.releaseNotes}
            </p>
          )}
          <button
            onClick={handleDownload}
            className="mt-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-dark"
          >
            Download Update
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-ec-text-muted hover:text-ec-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
