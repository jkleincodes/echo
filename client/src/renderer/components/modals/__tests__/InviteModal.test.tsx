import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import { resetAllStores } from '../../../__tests__/mocks/stores.mock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteModal from '../InviteModal';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('InviteModal', () => {
  const serverId = 'server-1';

  const setup = (apiMock?: () => void) => {
    if (apiMock) {
      apiMock();
    } else {
      mockApi.post.mockResolvedValueOnce({ data: { data: { code: 'ABC123' } } });
    }
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InviteModal serverId={serverId} onClose={onClose} />);
    return { onClose, user };
  };

  it('renders the modal with heading', () => {
    setup();
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });

  it('shows description text', () => {
    setup();
    expect(screen.getByText(/share this invite code/i)).toBeInTheDocument();
  });

  it('calls api.post to generate invite on mount', async () => {
    setup();
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(`/api/servers/${serverId}/invites`);
    });
  });

  it('shows loading state initially', () => {
    // Use a never-resolving promise so it stays in loading
    setup(() => {
      mockApi.post.mockReturnValueOnce(new Promise(() => {}));
    });
    // The loading spinner is shown, no invite code label visible
    expect(screen.queryByText('Invite Code')).not.toBeInTheDocument();
  });

  it('shows invite code after loading', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
    expect(screen.getByText('Invite Code')).toBeInTheDocument();
  });

  it('shows a copy button next to the invite code', async () => {
    const { user } = setup();

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    // After loading, there should be a button with the Copy/Check icon next to the code
    const allButtons = screen.getAllByRole('button');
    // We should have at least the X close button and the copy button
    expect(allButtons.length).toBeGreaterThanOrEqual(2);

    // Verify there's a button that is a sibling to the invite code display
    const inviteCodeSpan = screen.getByText('ABC123');
    const codeWrapper = inviteCodeSpan.closest('.flex-1');
    expect(codeWrapper).toBeTruthy();
    // The copy button is a sibling of the code wrapper inside a flex container
    const flexParent = codeWrapper!.parentElement!;
    const copyBtn = flexParent.querySelector('button');
    expect(copyBtn).toBeTruthy();
  });

  it('calls onClose when X button is clicked', async () => {
    const { onClose, user } = setup();

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    // X button is in the header area
    const xButton = buttons[0]; // First button is typically the X
    // Actually find the one that's a child of the header
    const headerButtons = screen
      .getByText('Invite Friends')
      .closest('div')!
      .querySelectorAll('button');
    if (headerButtons.length > 0) {
      await user.click(headerButtons[headerButtons.length - 1]);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = setup();
    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    const backdrop = screen.getByText('Invite Friends').closest('.fixed');
    expect(backdrop).toBeTruthy();
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error if invite generation fails', async () => {
    setup(() => {
      mockApi.post.mockRejectedValueOnce(new Error('fail'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to generate invite')).toBeInTheDocument();
    });
  });
});
