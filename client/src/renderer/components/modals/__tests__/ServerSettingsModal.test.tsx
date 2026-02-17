import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import {
  resetAllStores,
  createMockServer,
  createMockMember,
  createMockUser,
} from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import ServerSettingsModal from '../ServerSettingsModal';
import type { Role } from '../../../../../../shared/types';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  // Default mock for bans tab fetch
  mockApi.get.mockResolvedValue({ data: { data: [] } });
});

function createMockRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    name: 'Moderator',
    color: '#00ff00',
    position: 1,
    permissions: 'MANAGE_CHANNELS,KICK_MEMBERS',
    serverId: 'server-1',
    ...overrides,
  };
}

describe('ServerSettingsModal', () => {
  const serverId = 'server-1';
  const mockServer = createMockServer({ id: serverId, name: 'My Server', description: 'A test server' });

  const setup = (storeOverrides?: Record<string, unknown>) => {
    useServerStore.setState({
      servers: [mockServer],
      activeServerId: serverId,
      ...storeOverrides,
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ServerSettingsModal serverId={serverId} onClose={onClose} />);
    return { onClose, user };
  };

  // ── Tab rendering and switching ──

  it('renders the modal with Server Settings sidebar', () => {
    setup();
    expect(screen.getByText('Server Settings')).toBeInTheDocument();
  });

  it('renders all 4 tabs', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bans' })).toBeInTheDocument();
  });

  it('defaults to Overview tab', () => {
    setup();
    // The header should show "Overview"
    const headers = screen.getAllByText('Overview');
    // One in the sidebar tab, one in the content header
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('switches to Roles tab', async () => {
    const { user } = setup({ roles: [] });
    await user.click(screen.getByRole('button', { name: 'Roles' }));
    // Content header should show "Roles"
    const headers = screen.getAllByText('Roles');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('switches to Members tab', async () => {
    const { user } = setup({ members: [] });
    await user.click(screen.getByRole('button', { name: 'Members' }));
    const headers = screen.getAllByText('Members');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('switches to Bans tab', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Bans' }));
    const headers = screen.getAllByText('Bans');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onClose when X button is clicked', async () => {
    const { onClose, user } = setup();
    // Find the X close button in the content header
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find((b) => {
      const isTab = ['Overview', 'Roles', 'Members', 'Bans', 'Save Changes'].includes(
        b.textContent || '',
      );
      return !isTab && !b.textContent?.trim();
    });
    if (xButton) {
      await user.click(xButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = setup();
    const backdrop = document.querySelector('.fixed');
    expect(backdrop).toBeTruthy();
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  // ── Overview Tab ──

  describe('Overview tab', () => {
    it('shows server name input pre-filled from store', () => {
      setup();
      const input = screen.getByDisplayValue('My Server');
      expect(input).toBeInTheDocument();
    });

    it('shows server description input pre-filled from store', () => {
      setup();
      const textarea = screen.getByDisplayValue('A test server');
      expect(textarea).toBeInTheDocument();
    });

    it('has Server Name and Description labels', () => {
      setup();
      expect(screen.getByText('Server Name')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('has Save Changes button', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('disables Save Changes when server name is cleared', async () => {
      const { user } = setup();
      const input = screen.getByDisplayValue('My Server');
      await user.clear(input);
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    });

    it('calls api.patch on save and shows success', async () => {
      const { user } = setup();
      const updatedServer = { ...mockServer, name: 'Updated Server' };
      mockApi.patch.mockResolvedValueOnce({ data: { data: updatedServer } });

      const input = screen.getByDisplayValue('My Server');
      await user.clear(input);
      await user.type(input, 'Updated Server');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(mockApi.patch).toHaveBeenCalledWith(`/api/servers/${serverId}`, {
          name: 'Updated Server',
          description: 'A test server',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Changes saved!')).toBeInTheDocument();
      });
    });

    it('shows error on save failure', async () => {
      const { user } = setup();
      mockApi.patch.mockRejectedValueOnce(new Error('fail'));

      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to save changes')).toBeInTheDocument();
      });
    });

    it('shows Saving... while saving', async () => {
      const { user } = setup();
      mockApi.patch.mockReturnValueOnce(new Promise(() => {}));

      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });
    });
  });

  // ── Roles Tab ──

  describe('Roles tab', () => {
    it('shows role count', async () => {
      const role1 = createMockRole({ id: 'r1', name: 'Mod' });
      const role2 = createMockRole({ id: 'r2', name: 'Admin' });
      const { user } = setup({ roles: [role1, role2] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByText('2 roles')).toBeInTheDocument();
    });

    it('shows singular "role" for count === 1', async () => {
      const role1 = createMockRole({ id: 'r1', name: 'Mod' });
      const { user } = setup({ roles: [role1] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByText('1 role')).toBeInTheDocument();
    });

    it('shows "No custom roles yet" when empty', async () => {
      const { user } = setup({ roles: [] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByText('No custom roles yet')).toBeInTheDocument();
    });

    it('has New Role button', async () => {
      const { user } = setup({ roles: [] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByRole('button', { name: /New Role/i })).toBeInTheDocument();
    });

    it('shows role creation form when New Role is clicked', async () => {
      const { user } = setup({ roles: [] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));
      await user.click(screen.getByRole('button', { name: /New Role/i }));

      expect(screen.getByText('Role Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('New role')).toBeInTheDocument();
      expect(screen.getByText('Permissions')).toBeInTheDocument();
      expect(screen.getByText('Manage Channels')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Role' })).toBeInTheDocument();
    });

    it('shows role names in the list', async () => {
      const role1 = createMockRole({ id: 'r1', name: 'Moderator' });
      const { user } = setup({ roles: [role1] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByText('Moderator')).toBeInTheDocument();
    });

    it('shows role permissions badges', async () => {
      const role1 = createMockRole({
        id: 'r1',
        name: 'Mod',
        permissions: 'MANAGE_CHANNELS,KICK_MEMBERS',
      });
      const { user } = setup({ roles: [role1] });

      await user.click(screen.getByRole('button', { name: 'Roles' }));

      expect(screen.getByText('MANAGE_CHANNELS')).toBeInTheDocument();
      expect(screen.getByText('KICK_MEMBERS')).toBeInTheDocument();
    });
  });

  // ── Members Tab ──

  describe('Members tab', () => {
    it('shows member count', async () => {
      const member1 = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'member',
        user: createMockUser({ id: 'u1', displayName: 'Alice' }),
      });
      const member2 = createMockMember({
        id: 'm2',
        userId: 'u2',
        role: 'member',
        user: createMockUser({ id: 'u2', displayName: 'Bob' }),
      });
      const { user } = setup({ members: [member1, member2] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByText('2 members')).toBeInTheDocument();
    });

    it('shows member list with display names', async () => {
      const member1 = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'member',
        user: createMockUser({ id: 'u1', displayName: 'Alice' }),
      });
      const { user } = setup({ members: [member1] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('shows Owner badge for owner role', async () => {
      const ownerMember = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'owner',
        user: createMockUser({ id: 'u1', displayName: 'Owner User' }),
      });
      const { user } = setup({ members: [ownerMember] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByText('Owner')).toBeInTheDocument();
    });

    it('shows Admin badge for admin role', async () => {
      const adminMember = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'admin',
        user: createMockUser({ id: 'u1', displayName: 'Admin User' }),
      });
      const { user } = setup({ members: [adminMember] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('shows kick and ban buttons for member role', async () => {
      const member = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'member',
        user: createMockUser({ id: 'u1', displayName: 'Regular User' }),
      });
      const { user } = setup({ members: [member] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByTitle('Kick member')).toBeInTheDocument();
      expect(screen.getByTitle('Ban member')).toBeInTheDocument();
    });

    it('does not show kick/ban buttons for owner role', async () => {
      const ownerMember = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'owner',
        user: createMockUser({ id: 'u1', displayName: 'Owner User' }),
      });
      const { user } = setup({ members: [ownerMember] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.queryByTitle('Kick member')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban member')).not.toBeInTheDocument();
    });

    it('does not show kick/ban buttons for admin role', async () => {
      const adminMember = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'admin',
        user: createMockUser({ id: 'u1', displayName: 'Admin User' }),
      });
      const { user } = setup({ members: [adminMember] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.queryByTitle('Kick member')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban member')).not.toBeInTheDocument();
    });

    it('shows singular "member" for count === 1', async () => {
      const member = createMockMember({
        id: 'm1',
        userId: 'u1',
        role: 'member',
        user: createMockUser({ id: 'u1' }),
      });
      const { user } = setup({ members: [member] });

      await user.click(screen.getByRole('button', { name: 'Members' }));

      expect(screen.getByText('1 member')).toBeInTheDocument();
    });
  });

  // ── Bans Tab ──

  describe('Bans tab', () => {
    it('fetches bans from API on tab switch', async () => {
      const { user } = setup();
      mockApi.get.mockResolvedValueOnce({ data: { data: [] } });

      await user.click(screen.getByRole('button', { name: 'Bans' }));

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(`/api/servers/${serverId}/bans`);
      });
    });

    it('shows ban count after loading', async () => {
      const { user } = setup();
      mockApi.get.mockResolvedValueOnce({ data: { data: [] } });

      await user.click(screen.getByRole('button', { name: 'Bans' }));

      await waitFor(() => {
        expect(screen.getByText('0 bans')).toBeInTheDocument();
      });
    });

    it('shows "No banned users" when empty', async () => {
      const { user } = setup();
      mockApi.get.mockResolvedValueOnce({ data: { data: [] } });

      await user.click(screen.getByRole('button', { name: 'Bans' }));

      await waitFor(() => {
        expect(screen.getByText('No banned users')).toBeInTheDocument();
      });
    });

    it('shows ban list with user info', async () => {
      const { user } = setup();
      const bans = [
        {
          id: 'ban-1',
          userId: 'u1',
          serverId,
          reason: 'Spamming',
          bannedById: 'owner-1',
          createdAt: '2024-06-01T00:00:00.000Z',
          user: createMockUser({ id: 'u1', displayName: 'Bad User', username: 'baduser' }),
        },
      ];
      mockApi.get.mockResolvedValueOnce({ data: { data: bans } });

      await user.click(screen.getByRole('button', { name: 'Bans' }));

      await waitFor(() => {
        expect(screen.getByText('Bad User')).toBeInTheDocument();
      });
      expect(screen.getByText('1 ban')).toBeInTheDocument();
      expect(screen.getByText('Reason: Spamming')).toBeInTheDocument();
    });

    it('shows Unban button for each banned user', async () => {
      const { user } = setup();
      const bans = [
        {
          id: 'ban-1',
          userId: 'u1',
          serverId,
          reason: null,
          bannedById: 'owner-1',
          createdAt: '2024-06-01T00:00:00.000Z',
          user: createMockUser({ id: 'u1', displayName: 'Banned User' }),
        },
      ];
      mockApi.get.mockResolvedValueOnce({ data: { data: bans } });

      await user.click(screen.getByRole('button', { name: 'Bans' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unban' })).toBeInTheDocument();
      });
    });
  });
});
