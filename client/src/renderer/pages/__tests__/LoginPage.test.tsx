import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../__tests__/mocks/api.mock';
import '../../__tests__/mocks/socketService.mock';
import { resetAllStores } from '../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from '../LoginPage';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('renders username and password inputs', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByText(/username/i)).toBeInTheDocument();
    expect(screen.getByText(/password/i)).toBeInTheDocument();
    // Inputs exist (text + password)
    expect(document.querySelector('input[type="text"]')).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it('renders Log In button', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('renders register link', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByText(/register/i)).toBeInTheDocument();
  });

  it('disables button when isLoading', () => {
    useAuthStore.setState({ isLoading: true });
    renderWithRouter(<LoginPage />);
    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
  });

  it('displays error message', () => {
    useAuthStore.setState({ error: 'Invalid credentials' });
    renderWithRouter(<LoginPage />);
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('calls login on form submit', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValueOnce({
      data: { data: { token: 'tok', user: { id: '1', username: 'testuser', displayName: 'Test', avatarUrl: null, status: 'online' } } },
    });

    renderWithRouter(<LoginPage />);
    await user.type(document.querySelector('input[type="text"]')!, 'testuser');
    await user.type(document.querySelector('input[type="password"]')!, 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/api/auth/login', {
      username: 'testuser',
      password: 'password123',
    });
  });
});
