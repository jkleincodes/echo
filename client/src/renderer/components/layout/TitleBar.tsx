export default function TitleBar() {
  const isMac = (window as any).electronAPI?.platform === 'darwin';
  const electronAPI = (window as any).electronAPI;

  return (
    <div
      className="titlebar-drag flex h-8 shrink-0 items-center bg-ec-bg-tertiary"
      style={{ paddingLeft: isMac ? 78 : 8 }}
    >
      <span className="titlebar-no-drag text-xs font-semibold text-ec-text-muted">
        Echo
      </span>
      <span className="titlebar-no-drag ml-1.5 text-[9px] text-ec-text-muted/50">
        v{__APP_VERSION__}
      </span>

      {/* Window controls for Windows/Linux (macOS uses native traffic lights) */}
      {!isMac && electronAPI && (
        <div className="titlebar-no-drag ml-auto flex h-full items-stretch">
          <button
            onClick={() => electronAPI.windowMinimize()}
            className="flex w-[46px] items-center justify-center text-ec-text-muted hover:bg-ec-bg-modifier-hover"
            aria-label="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>
          <button
            onClick={() => electronAPI.windowMaximize()}
            className="flex w-[46px] items-center justify-center text-ec-text-muted hover:bg-ec-bg-modifier-hover"
            aria-label="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          </button>
          <button
            onClick={() => electronAPI.windowClose()}
            className="flex w-[46px] items-center justify-center text-ec-text-muted hover:bg-[#e81123] hover:text-white"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
              <line x1="0" y1="0" x2="10" y2="10" />
              <line x1="10" y1="0" x2="0" y2="10" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
