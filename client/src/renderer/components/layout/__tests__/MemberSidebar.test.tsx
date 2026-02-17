import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockMember, createMockUser } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import { usePresenceStore } from '../../../stores/presenceStore';
import MemberSidebar from '../MemberSidebar';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('MemberSidebar', () => {
  it('renders online members section', () => {
    const user1 = createMockUser({ id: 'u1', displayName: 'Alice' });
    const member1 = createMockMember({ userId: 'u1', user: user1 });
    useServerStore.setState({ members: [member1] });
    usePresenceStore.setState({ onlineUsers: new Set(['u1']) });
    renderWithRouter(<MemberSidebar />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders offline members section', () => {
    const user1 = createMockUser({ id: 'u1', displayName: 'Bob' });
    const member1 = createMockMember({ userId: 'u1', user: user1 });
    useServerStore.setState({ members: [member1] });
    usePresenceStore.setState({ onlineUsers: new Set() });
    renderWithRouter(<MemberSidebar />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('opens user profile modal on member click', async () => {
    const u = userEvent.setup();
    const user1 = createMockUser({ id: 'u1', displayName: 'Charlie' });
    const member1 = createMockMember({ userId: 'u1', user: user1 });
    useServerStore.setState({ members: [member1] });
    usePresenceStore.setState({ onlineUsers: new Set(['u1']) });

    mockApi.get.mockResolvedValueOnce({
      data: { data: { ...user1, createdAt: '2024-01-01T00:00:00Z' } },
    });

    renderWithRouter(<MemberSidebar />);
    await u.click(screen.getByText('Charlie'));
    expect(mockApi.get).toHaveBeenCalledWith('/api/users/u1');
  });

  it('shows member count in section headers', () => {
    const user1 = createMockUser({ id: 'u1', displayName: 'A' });
    const user2 = createMockUser({ id: 'u2', displayName: 'B' });
    const m1 = createMockMember({ userId: 'u1', user: user1 });
    const m2 = createMockMember({ userId: 'u2', user: user2 });
    useServerStore.setState({ members: [m1, m2] });
    usePresenceStore.setState({ onlineUsers: new Set(['u1']) });
    renderWithRouter(<MemberSidebar />);
    expect(screen.getByText(/online — 1/i)).toBeInTheDocument();
    expect(screen.getByText(/offline — 1/i)).toBeInTheDocument();
  });
});
