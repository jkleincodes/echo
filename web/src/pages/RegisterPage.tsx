import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const { register, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirect = searchParams.get('redirect');
  const isDesktop = searchParams.get('desktop') === 'true';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { token } = await register(username, displayName, password, email || undefined);

      if (isDesktop) {
        const res = await api.post('/api/auth/exchange-code');
        const code = res.data.data.code;
        window.location.href = `echo://auth?code=${code}`;
        return;
      }

      navigate(redirect || '/');
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
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
              minLength={8}
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

          <p className="text-sm text-ec-text-muted">
            Already have an account?{' '}
            <Link
              to={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}${isDesktop ? `${redirect ? '&' : '?'}desktop=true` : ''}`}
              className="text-ec-text-link hover:underline"
            >
              Log In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
