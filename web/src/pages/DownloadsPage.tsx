import { Apple, Monitor, Download } from 'lucide-react';

function getOS(): 'mac' | 'windows' | 'other' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'other';
}

const builds = [
  { os: 'mac' as const, label: 'Download for macOS', file: 'Echo.dmg', icon: Apple },
  { os: 'windows' as const, label: 'Download for Windows', file: 'Echo.exe', icon: Monitor },
];

export default function DownloadsPage() {
  const os = getOS();
  const sorted = [...builds].sort((a, b) => (a.os === os ? -1 : b.os === os ? 1 : 0));

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <Download size={48} className="text-accent" />
        </div>
        <h1 className="mb-2 text-3xl font-bold text-ec-text-primary">Download Echo</h1>
        <p className="mb-8 text-ec-text-secondary">
          Get the desktop app for the best experience.
        </p>
        <div className="flex flex-col gap-3">
          {sorted.map((b) => {
            const primary = b.os === os;
            return (
              <a
                key={b.os}
                href={`/downloads/${b.file}`}
                className={`flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors ${
                  primary
                    ? 'bg-accent text-white hover:bg-accent-dark'
                    : 'bg-ec-bg-primary text-ec-text-secondary hover:bg-ec-bg-secondary'
                }`}
              >
                <b.icon size={18} />
                {b.label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
