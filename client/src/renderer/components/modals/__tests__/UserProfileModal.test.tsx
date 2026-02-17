import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores, createMockServer } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDMStore } from '../../../stores/dmStore';
import UserProfileModal from '../UserProfileModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('UserProfileModal', () => {
  const userId = 'user-42';
  const profileData = {
    id: userId,
    username: 'johndoe',
    displayName: 'John Doe',
    avatarUrl: null,
    status: 'online' as const,
    bio: 'I love coding',
    customStatus: 'Building stuff',
    bannerColor: '#0ea5e9',
    bannerUrl: null,
    pronouns: 'he/him',
    createdAt: '2024-01-15T00:00:00.000Z',
    mutualServers: [
      createMockServer({ id: 's1', name: 'Gaming' }),
      createMockServer({ id: 's2', name: 'Music' }),
    ],
  };

  const setup = (apiMock?: () => void) => {
    if (apiMock) {
      apiMock();
    } else {
      mockApi.get.mockResolvedValueOnce({ data: { data: profileData } });
    }
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UserProfileModal userId={userId} onClose={onClose} />);
    return { onClose, user };
  };

  it('calls api.get to fetch user profile on mount', async () => {
    setup();
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(`/api/users/${userId}`);
    });
  });

  it('shows loading state initially', () => {
    setup(() => {
      mockApi.get.mockReturnValueOnce(new Promise(() => {}));
    });
    // While loading, the profile content should not be visible
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('shows error message if fetch fails', async () => {
    setup(() => {
      mockApi.get.mockRejectedValueOnce(new Error('not found'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
    });
  });

  it('shows displayName on success', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('shows username on success', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('johndoe')).toBeInTheDocument();
    });
  });

  it('shows bio on success', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('I love coding')).toBeInTheDocument();
    });
    expect(screen.getByText('About Me')).toBeInTheDocument();
  });

  it('shows customStatus on success', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Building stuff')).toBeInTheDocument();
    });
  });

  it('shows Member Since section with formatted date', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Member Since')).toBeInTheDocument();
    });
    // The date is formatted based on the locale; check it contains "2024" and "Jan"
    const dateEl = screen.getByText('Member Since').nextElementSibling;
    expect(dateEl?.textContent).toContain('2024');
    expect(dateEl?.textContent).toContain('Jan');
  });

  it('shows mutual servers', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Mutual Servers/)).toBeInTheDocument();
    });
    expect(screen.getByText('Gaming')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('shows Message button', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Message/i })).toBeInTheDocument();
    });
  });

  it('Message button creates DM channel and calls onClose', async () => {
    const { onClose, user } = setup();
    const mockChannel = { id: 'dm-1', createdAt: new Date().toISOString(), participants: [] };
    mockApi.post.mockResolvedValueOnce({ data: { data: mockChannel } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Message/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Message/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/dms', { userId });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when X button is clicked', async () => {
    const { onClose, user } = setup();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // X button is on the banner
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find((b) => {
      return b.querySelector('svg') && !b.textContent?.includes('Message');
    });
    if (xButton) {
      await user.click(xButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = setup();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const backdrop = document.querySelector('.fixed');
    expect(backdrop).toBeTruthy();
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show bio section when bio is null', async () => {
    const noBioProfile = { ...profileData, bio: null };
    setup(() => {
      mockApi.get.mockResolvedValueOnce({ data: { data: noBioProfile } });
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.queryByText('About Me')).not.toBeInTheDocument();
  });

  it('does not show mutual servers when empty', async () => {
    const noMutualsProfile = { ...profileData, mutualServers: [] };
    setup(() => {
      mockApi.get.mockResolvedValueOnce({ data: { data: noMutualsProfile } });
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Mutual Servers/)).not.toBeInTheDocument();
  });

  it('shows close button on error state', async () => {
    const { onClose, user } = setup(() => {
      mockApi.get.mockRejectedValueOnce(new Error('fail'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows pronouns when present', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('he/him')).toBeInTheDocument();
    });
  });

  it('does not show pronouns when null', async () => {
    const noPronounsProfile = { ...profileData, pronouns: null };
    setup(() => {
      mockApi.get.mockResolvedValueOnce({ data: { data: noPronounsProfile } });
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.queryByText('he/him')).not.toBeInTheDocument();
  });

  it('renders banner with background image when bannerUrl is set', async () => {
    const bannerProfile = { ...profileData, bannerUrl: '/uploads/banner.png' };
    setup(() => {
      mockApi.get.mockResolvedValueOnce({ data: { data: bannerProfile } });
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const bannerDiv = document.querySelector('.bg-cover.bg-center');
    expect(bannerDiv).toBeTruthy();
    expect((bannerDiv as HTMLElement).style.backgroundImage).toContain('/uploads/banner.png');
  });

  it('renders banner with background color when bannerUrl is null', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const bannerDiv = document.querySelector('.bg-cover.bg-center');
    expect(bannerDiv).toBeTruthy();
    expect((bannerDiv as HTMLElement).style.backgroundColor).toBeTruthy();
  });
});
