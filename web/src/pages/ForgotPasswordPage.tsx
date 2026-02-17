import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg">
        {submitted ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ec-text-primary">Check your email</h1>
            <p className="mt-2 text-ec-text-secondary">
              If an account with that email exists, we've sent a password reset link.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block text-ec-text-link hover:underline"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-5 text-center">
              <h1 className="text-2xl font-semibold text-ec-text-primary">Forgot your password?</h1>
              <p className="mt-2 text-ec-text-secondary">
                Enter your email and we'll send you a link to reset it.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded bg-red/10 p-3 text-sm text-red">{error}</div>
              )}

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-accent p-2.5 font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="text-sm text-ec-text-muted">
                <Link to="/login" className="text-ec-text-link hover:underline">
                  Back to Login
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
