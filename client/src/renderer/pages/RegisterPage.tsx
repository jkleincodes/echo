import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api, setApiToken } from '../lib/api';
import { socketService } from '../services/socketService';
import { getServerUrl } from '../lib/serverUrl';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const { register, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  // Listen for desktop auth deep link callback (same as LoginPage)
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
        useAuthStore.setState({ error: 'Browser registration failed', isLoading: false });
      }
    });
    return () => { cleanup?.(); };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await register(username, displayName, password, email || undefined);
      navigate('/channels');
    } catch {}
  };

  const handleBrowserRegister = () => {
    window.electronAPI?.openExternal?.(`${getServerUrl()}/register?desktop=true`);
  };

  return (
    <div className="flex h-full items-center justify-center bg-ec-bg-tertiary">
      <div className="w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-ec-text-primary">Create an account</h1>
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
              minLength={3}
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
              Email <span className="font-normal normal-case text-ec-text-muted">— optional</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-ec-text-muted">
              Required for password reset and 2FA recovery. Without it, account recovery is impossible.
            </p>
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
              minLength={6}
              className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
          >
            {isLoading ? 'Creating account...' : 'Continue'}
          </button>

          {window.electronAPI?.openExternal && (
            <button
              type="button"
              onClick={handleBrowserRegister}
              className="flex w-full items-center justify-center gap-2 rounded bg-ec-bg-tertiary p-2.5 font-medium text-ec-text-primary transition-colors hover:bg-ec-bg-modifier-hover"
            >
              <ExternalLink size={16} />
              Sign Up with Browser
            </button>
          )}

          <p className="text-sm text-ec-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-ec-text-link hover:underline">
              Log In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
