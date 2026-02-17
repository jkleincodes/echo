import { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useServerStore } from './stores/serverStore';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AppLayout from './components/layout/AppLayout';
import UpdateToast from './components/ui/UpdateToast';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  if (!user && !token) return <Navigate to="/login" replace />;
  if (token && !user) return null; // Still hydrating
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to="/channels" replace />;
  return <>{children}</>;
}

function useInviteDeepLink(ready: boolean) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const fetchServers = useServerStore((s) => s.fetchServers);
  const setActiveServer = useServerStore((s) => s.setActiveServer);
  const pendingInviteRef = useRef<string | null>(null);

  const processInvite = useCallback(async (code: string) => {
    if (!useAuthStore.getState().user) {
      pendingInviteRef.current = code;
      return;
    }
    try {
      const res = await api.post(`/api/invites/${encodeURIComponent(code)}/join`);
      const server = res.data.data;
      await fetchServers();
      setActiveServer(server.id);
      navigate(`/channels/${server.id}`);
    } catch (err: any) {
      console.error('Failed to join via invite deep link:', err.response?.data?.error || err.message);
    }
  }, [fetchServers, setActiveServer, navigate]);

  // Listen for invite deep links from Electron
  useEffect(() => {
    if (!ready) return;
    const cleanup = window.electronAPI?.onInviteCallback?.((code: string) => {
      processInvite(code);
    });
    return () => { cleanup?.(); };
  }, [ready, processInvite]);

  // Process pending invite after login
  useEffect(() => {
    if (user && pendingInviteRef.current) {
      const code = pendingInviteRef.current;
      pendingInviteRef.current = null;
      processInvite(code);
    }
  }, [user, processInvite]);
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
  }, [hydrate]);

  useInviteDeepLink(ready);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-ec-bg-tertiary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/channels/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/channels" replace />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
