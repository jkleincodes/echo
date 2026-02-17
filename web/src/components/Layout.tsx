import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { MessageCircle, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [suggestionName, setSuggestionName] = useState('');
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [suggestionError, setSuggestionError] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestionText.trim()) return;

    setSuggestionStatus('sending');
    setSuggestionError('');

    try {
      await api.post('/api/suggestions', {
        name: suggestionName.trim() || undefined,
        suggestion: suggestionText.trim(),
      });
      setSuggestionStatus('success');
      setSuggestionName('');
      setSuggestionText('');
      setTimeout(() => {
        setSuggestionStatus('idle');
        setShowSuggestionForm(false);
      }, 3000);
    } catch (err: any) {
      setSuggestionStatus('error');
      setSuggestionError(err.response?.data?.error || 'Failed to submit suggestion');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-ec-bg-tertiary">
      <nav className="flex items-center justify-between border-b border-ec-bg-primary px-6 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-ec-text-primary">
          <MessageCircle size={28} className="text-accent" />
          Echo
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-ec-text-secondary">
                {user.displayName}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded bg-ec-bg-primary px-3 py-1.5 text-sm text-ec-text-secondary hover:text-ec-text-primary"
              >
                <LogOut size={16} />
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded px-4 py-2 text-sm font-medium text-ec-text-primary hover:underline"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ec-bg-primary px-6 py-4 text-center text-sm text-ec-text-muted">
        <p>Echo &mdash; Open-source communication platform</p>

        <div className="mt-2">
          {!showSuggestionForm ? (
            <button
              onClick={() => setShowSuggestionForm(true)}
              className="text-ec-text-muted underline hover:text-ec-text-secondary"
            >
              Have a suggestion?
            </button>
          ) : (
            <form
              onSubmit={handleSuggestionSubmit}
              className="mx-auto mt-2 flex max-w-md flex-col gap-2"
            >
              <input
                type="text"
                placeholder="Name (optional)"
                value={suggestionName}
                onChange={(e) => setSuggestionName(e.target.value)}
                maxLength={100}
                className="rounded border border-ec-bg-primary bg-ec-bg-secondary px-3 py-1.5 text-sm text-ec-text-primary placeholder:text-ec-text-muted"
              />
              <textarea
                placeholder="Your suggestion..."
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                maxLength={2000}
                rows={3}
                required
                className="rounded border border-ec-bg-primary bg-ec-bg-secondary px-3 py-1.5 text-sm text-ec-text-primary placeholder:text-ec-text-muted"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSuggestionForm(false);
                    setSuggestionStatus('idle');
                    setSuggestionError('');
                  }}
                  className="rounded px-3 py-1.5 text-sm text-ec-text-muted hover:text-ec-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={suggestionStatus === 'sending' || !suggestionText.trim()}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {suggestionStatus === 'sending' ? 'Sending...' : 'Submit'}
                </button>
              </div>
              {suggestionStatus === 'success' && (
                <p className="text-sm text-green-400">Thanks for your suggestion!</p>
              )}
              {suggestionStatus === 'error' && (
                <p className="text-sm text-red-400">{suggestionError}</p>
              )}
            </form>
          )}
        </div>
      </footer>
    </div>
  );
}
