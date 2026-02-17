import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../__tests__/mocks/api.mock';
import '../../__tests__/mocks/socketService.mock';
import { resetAllStores } from '../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../stores/authStore';
import RegisterPage from '../RegisterPage';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('renders all form inputs', () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByText(/username/i)).toBeInTheDocument();
    expect(screen.getByText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/password/i)).toBeInTheDocument();
    const textInputs = document.querySelectorAll('input[type="text"]');
    expect(textInputs.length).toBe(2); // username + display name
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it('renders Continue button', () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('renders login link', () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
  });

  it('shows loading text when isLoading', () => {
    useAuthStore.setState({ isLoading: true });
    renderWithRouter(<RegisterPage />);
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });

  it('displays error message', () => {
    useAuthStore.setState({ error: 'Username taken' });
    renderWithRouter(<RegisterPage />);
    expect(screen.getByText('Username taken')).toBeInTheDocument();
  });

  it('calls register on form submit', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValueOnce({
      data: { data: { token: 'tok', user: { id: '1', username: 'newuser', displayName: 'New User', avatarUrl: null, status: 'online' } } },
    });

    renderWithRouter(<RegisterPage />);
    const textInputs = document.querySelectorAll('input[type="text"]');
    await user.type(textInputs[0]!, 'newuser');
    await user.type(textInputs[1]!, 'New User');
    await user.type(document.querySelector('input[type="password"]')!, 'password123');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/api/auth/register', {
      username: 'newuser',
      displayName: 'New User',
      password: 'password123',
    });
  });
});
