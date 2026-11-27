import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchChessComGames,
  fetchGameByUrl,
  fetchLichessGames,
} from '../../src/client/onlineSync.js';

describe('online game sync', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects empty username requests', async () => {
    await expect(fetchChessComGames('')).rejects.toThrow('Enter a Chess.com username.');
    await expect(fetchLichessGames('   ')).rejects.toThrow('Enter a Lichess username.');
  });

  it('fetches and sorts Chess.com games from archives', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/games/archives')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              archives: [
                'https://api.chess.com/pub/player/hikaru/games/2026/10',
                'https://api.chess.com/pub/player/hikaru/games/2026/11',
              ],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            games: [
              {
                url: 'https://www.chess.com/game/live/101',
                pgn: '[White "Hikaru"]\n[Black "Opponent"]\n\n1. e4 e5 1-0',
                time_control: '180+1',
                time_class: 'blitz',
                end_time: 1700000100,
                white: { username: 'hikaru', rating: 3200, result: 'win' },
                black: { username: 'opponent', rating: 2800, result: 'resigned' },
              },
            ],
          }),
      });
    });

    const games = await fetchChessComGames('hikaru', 1);
    expect(games).toHaveLength(1);
    expect(games[0]?.platform).toBe('chesscom');
    expect(games[0]?.white.username).toBe('hikaru');
    expect(games[0]?.result).toBe('1-0');
    expect(games[0]?.timeControl).toBe('180+1');
  });

  it('fetches and parses Lichess games from PGN feed', async () => {
    const lichessPgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/L07dBpjM"]
[Date "2026.11.25"]
[White "Magnus"]
[Black "Challenger"]
[Result "1-0"]
[WhiteElo "3100"]
[BlackElo "2850"]
[TimeControl "180+0"]

1. e4 e5 2. Nf3 Nc6 1-0`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(lichessPgn),
    });

    const games = await fetchLichessGames('magnus', 5);
    expect(games).toHaveLength(1);
    expect(games[0]?.platform).toBe('lichess');
    expect(games[0]?.id).toBe('L07dBpjM');
    expect(games[0]?.white.username).toBe('Magnus');
    expect(games[0]?.black.username).toBe('Challenger');
    expect(games[0]?.result).toBe('1-0');
  });

  it('fetches game directly from Lichess URL or ID', async () => {
    const mockPgn = '[Event "Match"]\n\n1. d4 d5 *';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockPgn),
    });

    const pgn = await fetchGameByUrl('https://lichess.org/L07dBpjM');
    expect(pgn).toBe(mockPgn);

    const pgnFromId = await fetchGameByUrl('L07dBpjM');
    expect(pgnFromId).toBe(mockPgn);

    await expect(fetchGameByUrl('invalid-url-string')).rejects.toThrow('Unsupported game URL');
  });
});
