import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from './mocks/api.mock';
import './mocks/socketService.mock';
import './mocks/voiceService.mock';
import { resetAllStores, createMockUser } from './mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import App from '../App';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('App', () => {
  it('shows loading spinner initially', () => {
    // hydrate will try to read localStorage token
    mockApi.get.mockImplementation(() => new Promise(() => {})); // never resolves
    localStorage.setItem('token', 'test-token');
    render(
      <MemoryRouter initialEntries={['/channels']}>
        <App />
      </MemoryRouter>,
    );
    // The loading spinner has animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login', async () => {
    // No token in localStorage, hydrate resolves quickly
    render(
      <MemoryRouter initialEntries={['/channels']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
  });

  it('redirects authenticated user from /login to /channels', async () => {
    const mockUser = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user: mockUser, token: 'tok' });
    // Mock hydrate to resolve immediately
    mockApi.get.mockResolvedValueOnce({ data: { data: mockUser } });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      // Should NOT show login page - should show app layout or welcome
      expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
    });
  });

  it('renders login page at /login for guests', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
  });

  it('renders register page at /register for guests', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/create an account/i)).toBeInTheDocument();
    });
  });
});
