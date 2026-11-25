import { afterEach, expect, it, vi } from 'vitest';
import { getToken, setToken } from '../../src/client/api';

afterEach(() => {
  setToken('');
  vi.unstubAllGlobals();
});

it('keeps authentication usable in memory when browser session storage is blocked', () => {
  vi.stubGlobal('sessionStorage', {
    getItem: () => {
      throw new Error('Storage blocked');
    },
    setItem: () => {
      throw new Error('Storage blocked');
    },
    removeItem: () => {
      throw new Error('Storage blocked');
    },
  });
  setToken('a-test-only-session-token');
  expect(getToken()).toBe('a-test-only-session-token');
  setToken('');
  expect(getToken()).toBe('');
});
