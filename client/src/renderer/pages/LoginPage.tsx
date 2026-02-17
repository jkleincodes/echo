import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api, setApiToken, updateApiBaseUrl } from '../lib/api';
import { socketService } from '../services/socketService';
import { getServerUrl, setServerUrl } from '../lib/serverUrl';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      openExternal?: (url: string) => void;
      onAuthCallback?: (callback: (code: string) => void) => () => void;
      onInviteCallback?: (callback: (code: string) => void) => () => void;
      onUpdateAvailable?: (callback: (data: { version: string; downloadUrl: string; releaseNotes: string }) => void) => () => void;
      getServerUrl?: () => Promise<string>;
      setServerUrl?: (url: string) => Promise<boolean>;
    };
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl());
  const { login, verifyMfa, clearMfa, mfaRequired, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  // Sync server URL from main process on mount (Electron only)
  useEffect(() => {
    window.electronAPI?.getServerUrl?.().then((url) => {
      setServerUrlInput(url);
      setServerUrl(url);
      updateApiBaseUrl();
    });
  }, []);

  // Listen for desktop auth deep link callback
  useEffect(() => {
    const cleanup = window.electronAPI?.onAuthCallback?.(async (code: string) => {
      try {
        const res = await api.post('/api/auth/exchange', { code });
        const token = res.data.data.token;
        setApiToken(token);

        if (window.secureStorage) {
          await window.secureStorage.set(token);
        } else {
          localStorage.setItem('token', token);
        }

        const meRes = await api.get('/api/auth/me');
        const user = meRes.data.data;
        socketService.connect(token);
        useAuthStore.setState({ user, token, isLoading: false });
        navigate('/channels');
      } catch {
        useAuthStore.setState({ error: 'Browser login failed', isLoading: false });
      }
    });
    return () => { cleanup?.(); };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      if (!useAuthStore.getState().mfaRequired) {
        navigate('/channels');
      }
    } catch {}
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await verifyMfa(totpCode);
      navigate('/channels');
    } catch {}
  };

  const handleTotpChange = async (value: string) => {
    setTotpCode(value);
    // Auto-submit on 6 digits (not recovery codes)
    if (!useRecoveryCode && value.length === 6 && /^\d{6}$/.test(value)) {
      try {
        await verifyMfa(value);
        navigate('/channels');
      } catch {}
    }
  };

  const handleBackToLogin = () => {
    clearMfa();
    setTotpCode('');
    setUseRecoveryCode(false);
  };

  const handleBrowserLogin = () => {
    window.electronAPI?.openExternal?.(`${getServerUrl()}/login?desktop=true`);
  };

  const handleServerUrlSave = () => {
    const trimmed = serverUrlInput.trim().replace(/\/+$/, '');
    if (trimmed) {
      setServerUrl(trimmed);
      updateApiBaseUrl();
      window.electronAPI?.setServerUrl?.(trimmed);
    }
  };

  if (mfaRequired) {
    return (
      <div className="flex h-full items-center justify-center bg-ec-bg-tertiary">
        <div className="w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
          <div className="mb-5 text-center">
            <h1 className="text-2xl font-semibold text-ec-text-primary">Two-Factor Authentication</h1>
            <p className="mt-2 text-ec-text-secondary">
              {useRecoveryCode
                ? 'Enter one of your recovery codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </p>
          </div>

          <form onSubmit={handleMfaSubmit} className="space-y-5">
            {error && (
              <div className="rounded bg-red/10 p-3 text-sm text-red">{error}</div>
            )}

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
                {useRecoveryCode ? 'Recovery Code' : 'Authentication Code'}
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => handleTotpChange(e.target.value)}
                required
                autoFocus
                maxLength={useRecoveryCode ? 8 : 6}
                placeholder={useRecoveryCode ? 'xxxxxxxx' : '000000'}
                className="w-full rounded bg-ec-input-bg p-2.5 text-center text-lg tracking-widest text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>

            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={() => { setUseRecoveryCode(!useRecoveryCode); setTotpCode(''); }}
                className="text-ec-text-link hover:underline"
              >
                {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
              </button>
              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-ec-text-muted hover:text-ec-text-primary"
              >
                Back to login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-ec-bg-tertiary">
      <div className="w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-ec-text-primary">Welcome back!</h1>
          <p className="mt-2 text-ec-text-secondary">We're so excited to see you again!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded bg-red/10 p-3 text-sm text-red">{error}</div>
          )}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>

          {window.electronAPI?.openExternal && (
            <button
              type="button"
              onClick={handleBrowserLogin}
              className="flex w-full items-center justify-center gap-2 rounded bg-ec-bg-tertiary p-2.5 font-medium text-ec-text-primary transition-colors hover:bg-ec-bg-modifier-hover"
            >
              <ExternalLink size={16} />
              Log In with Browser
            </button>
          )}

          {/* Advanced: Server URL */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-ec-text-muted hover:text-ec-text-secondary"
            >
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-bold uppercase text-ec-text-secondary">
                  Server URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    onBlur={handleServerUrlSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleServerUrlSave(); } }}
                    placeholder="https://echo.example.com"
                    className="w-full rounded bg-ec-input-bg p-2 text-sm text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <p className="mt-1 text-xs text-ec-text-muted">
                  For self-hosted instances. Changes take effect on next login.
                </p>
              </div>
            )}
          </div>

          <p className="text-sm text-ec-text-muted">
            Need an account?{' '}
            <Link to="/register" className="text-ec-text-link hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
