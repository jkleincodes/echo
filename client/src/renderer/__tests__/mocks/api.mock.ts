import { vi } from 'vitest';

export const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  defaults: { headers: { common: {} } },
};

export const mockSetApiToken = vi.fn();

vi.mock('@/lib/api', () => ({
  api: mockApi,
  setApiToken: mockSetApiToken,
}));
