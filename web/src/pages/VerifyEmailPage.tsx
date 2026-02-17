import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Missing verification token');
      return;
    }

    api.post('/api/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Verification failed');
      });
  }, [token]);

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
      <div className="w-full max-w-[480px] rounded-md bg-ec-bg-primary p-8 shadow-lg text-center">
        {status === 'loading' && (
          <>
            <h1 className="text-2xl font-semibold text-ec-text-primary">Verifying your email...</h1>
            <p className="mt-2 text-ec-text-secondary">Please wait.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-semibold text-ec-text-primary">Email verified!</h1>
            <p className="mt-2 text-ec-text-secondary">Your email has been successfully verified.</p>
            <Link
              to="/login"
              className="mt-4 inline-block rounded bg-accent px-6 py-2.5 font-medium text-white hover:bg-accent-dark"
            >
              Continue to Login
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-semibold text-ec-text-primary">Verification failed</h1>
            <p className="mt-2 text-ec-text-secondary">{errorMsg}</p>
            <Link
              to="/login"
              className="mt-4 inline-block rounded bg-accent px-6 py-2.5 font-medium text-white hover:bg-accent-dark"
            >
              Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
