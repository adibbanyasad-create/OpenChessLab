import { afterEach, expect, it, vi } from 'vitest';
import { api, getToken, setToken } from '../../src/client/api';

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

it('honors explicit removal of a token from available session storage', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  setToken('a-test-only-session-token');
  expect(getToken()).toBe('a-test-only-session-token');
  values.clear();
  expect(getToken()).toBe('');
});

it.each([
  { headers: new Headers({ 'X-Request-Test': 'preserved' }) },
  { headers: [['X-Request-Test', 'preserved']] },
  { headers: { 'X-Request-Test': 'preserved' } },
] as { headers: HeadersInit }[])(
  'preserves all supported RequestInit header representations',
  async ({ headers }) => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'a-test-only-session-token' });
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      const sent = new Headers(options?.headers);
      expect(sent.get('X-Request-Test')).toBe('preserved');
      expect(sent.get('Authorization')).toBe('Bearer a-test-only-session-token');
      expect(sent.get('Content-Type')).toBe('application/json');
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/test', { method: 'POST', body: '{}', headers })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it('provides a useful error when an unavailable server returns non-JSON content', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Unavailable', { status: 503 })),
  );
  await expect(api('/health')).rejects.toThrow('Request failed (503)');
});
