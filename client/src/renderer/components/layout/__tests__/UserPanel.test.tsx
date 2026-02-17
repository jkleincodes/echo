import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../../stores/authStore';
import { useVoiceStore } from '../../../stores/voiceStore';
import UserPanel from '../UserPanel';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('UserPanel', () => {
  it('returns null when no user', () => {
    const { container } = renderWithRouter(<UserPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders user info when logged in', () => {
    const user = createMockUser({ id: 'u1', displayName: 'Test User', username: 'testuser' });
    useAuthStore.setState({ user, token: 'tok' });
    renderWithRouter(<UserPanel />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('shows user settings button', () => {
    const user = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user, token: 'tok' });
    renderWithRouter(<UserPanel />);
    expect(screen.getByTitle('User Settings')).toBeInTheDocument();
  });

  it('does not show mute/deafen when not voice connected', () => {
    const user = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user, token: 'tok' });
    renderWithRouter(<UserPanel />);
    expect(screen.queryByTitle('Mute')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Deafen')).not.toBeInTheDocument();
  });

  it('shows mute/deafen buttons when voice connected', () => {
    const user = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user, token: 'tok' });
    useVoiceStore.setState({ connected: true, channelId: 'vc1' });
    renderWithRouter(<UserPanel />);
    expect(screen.getByTitle('Mute')).toBeInTheDocument();
    expect(screen.getByTitle('Deafen')).toBeInTheDocument();
  });

  it('opens user settings modal', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ id: 'u1', displayName: 'Test', username: 'test' });
    useAuthStore.setState({ user, token: 'tok' });
    renderWithRouter(<UserPanel />);
    await u.click(screen.getByTitle('User Settings'));
    expect(screen.getByText('User Settings')).toBeInTheDocument();
  });

  it('calls logout from settings modal', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ id: 'u1' });
    useAuthStore.setState({ user, token: 'tok' });
    renderWithRouter(<UserPanel />);
    await u.click(screen.getByTitle('User Settings'));
    await u.click(screen.getByText('Log Out'));
    expect(useAuthStore.getState().user).toBeNull();
  });
});
