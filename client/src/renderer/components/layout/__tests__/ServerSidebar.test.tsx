import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '../../../__tests__/mocks/api.mock';
import '../../../__tests__/mocks/socketService.mock';
import '../../../__tests__/mocks/voiceService.mock';
import { resetAllStores, createMockServer } from '../../../__tests__/mocks/stores.mock';
import { renderWithRouter } from '../../../__tests__/mocks/router.mock';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useServerStore } from '../../../stores/serverStore';
import ServerSidebar from '../ServerSidebar';

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

describe('ServerSidebar', () => {
  it('renders DM button', () => {
    renderWithRouter(<ServerSidebar />);
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument();
  });

  it('renders Add a Server button', () => {
    renderWithRouter(<ServerSidebar />);
    expect(screen.getByTitle('Add a Server')).toBeInTheDocument();
  });

  it('renders Join a Server button', () => {
    renderWithRouter(<ServerSidebar />);
    expect(screen.getByTitle('Join a Server')).toBeInTheDocument();
  });

  it('renders server buttons', () => {
    const server = createMockServer({ id: 's1', name: 'My Server' });
    useServerStore.setState({ servers: [server] });
    renderWithRouter(<ServerSidebar />);
    expect(screen.getByTitle('My Server')).toBeInTheDocument();
  });

  it('opens create server modal on Add click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerSidebar />);
    await user.click(screen.getByTitle('Add a Server'));
    expect(screen.getByText('Create a server')).toBeInTheDocument();
  });

  it('opens join server modal on Join click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerSidebar />);
    await user.click(screen.getByTitle('Join a Server'));
    expect(screen.getByText('Join a Server')).toBeInTheDocument();
  });

  it('calls setShowHome when DM button is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerSidebar />);
    await user.click(screen.getByTitle('Direct Messages'));
    expect(useServerStore.getState().showHome).toBe(true);
  });
});
