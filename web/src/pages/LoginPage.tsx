import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const { login, verifyMfa, clearMfa, mfaRequired, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirect = searchParams.get('redirect');
  const isDesktop = searchParams.get('desktop') === 'true';

  const completeLogin = async (token: string) => {
    if (isDesktop && token) {
      const res = await api.post('/api/auth/exchange-code');
      const code = res.data.data.code;
      window.location.href = `echo://auth?code=${code}`;
      return;
    }
    navigate(redirect || '/');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await login(username, password);
      if (!useAuthStore.getState().mfaRequired) {
        await completeLogin(result.token);
      }
    } catch {
      // error is set in store
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await verifyMfa(totpCode);
      await completeLogin(result.token);
    } catch {}
  };

  const handleTotpChange = async (value: string) => {
    setTotpCode(value);
    if (!useRecoveryCode && value.length === 6 && /^\d{6}$/.test(value)) {
      try {
        const result = await verifyMfa(value);
        await completeLogin(result.token);
      } catch {}
    }
  };

  const handleBackToLogin = () => {
    clearMfa();
    setTotpCode('');
    setUseRecoveryCode(false);
  };

  if (mfaRequired) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
        <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
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
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
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
            <Link
              to="/forgot-password"
              className="mt-1 block text-xs text-ec-text-link hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>

          <p className="text-sm text-ec-text-muted">
            Need an account?{' '}
            <Link
              to={`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}${isDesktop ? `${redirect ? '&' : '?'}desktop=true` : ''}`}
              className="text-ec-text-link hover:underline"
            >
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
