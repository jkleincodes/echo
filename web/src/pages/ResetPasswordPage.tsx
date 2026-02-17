import { useState, useEffect, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'validating' | 'ready' | 'success' | 'error'>('validating');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Missing reset token');
      return;
    }

    api.get(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('ready'))
      .catch((err) => {
        setStatus('error');
        setError(err.response?.data?.error || 'Invalid or expired token');
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setStatus('success');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
        {status === 'validating' && (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ec-text-primary">Validating...</h1>
            <p className="mt-2 text-ec-text-secondary">Please wait.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ec-text-primary">Reset failed</h1>
            <p className="mt-2 text-ec-text-secondary">{error}</p>
            <Link
              to="/forgot-password"
              className="mt-4 inline-block text-ec-text-link hover:underline"
            >
              Request a new link
            </Link>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ec-text-primary">Password reset!</h1>
            <p className="mt-2 text-ec-text-secondary">Your password has been updated.</p>
            <Link
              to="/login"
              className="mt-4 inline-block rounded bg-accent px-6 py-2.5 font-medium text-white hover:bg-accent-dark"
            >
              Log In
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="mb-5 text-center">
              <h1 className="text-2xl font-semibold text-ec-text-primary">Reset your password</h1>
              <p className="mt-2 text-ec-text-secondary">Enter your new password below.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded bg-red/10 p-3 text-sm text-red">{error}</div>
              )}

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
                  New Password
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

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
