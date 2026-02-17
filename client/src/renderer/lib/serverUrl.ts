const STORAGE_KEY = 'echo-server-url';

let cached: string | null = null;

export function getServerUrl(): string {
  if (cached !== null) return cached;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  cached = __DEFAULT_SERVER_URL__;
  return cached;
}

export function setServerUrl(url: string): void {
  const normalized = url.replace(/\/+$/, ''); // strip trailing slashes
  localStorage.setItem(STORAGE_KEY, normalized);
  cached = normalized;
}

export function clearServerUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
  cached = null;
}
