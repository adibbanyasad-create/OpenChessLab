// Online game sync: 1-click game import from public Chess.com and Lichess APIs.
// Runs directly in the browser (both services send Access-Control-Allow-Origin: *).
// Zero accounts or API keys required.

import { parseGame } from '../shared/chess.js';

export interface OnlineGameItem {
  id: string;
  platform: 'chesscom' | 'lichess';
  white: { username: string; rating?: number; result?: string };
  black: { username: string; rating?: number; result?: string };
  timeControl: string;
  timeClass?: string;
  date: string;
  result: string;
  pgn: string;
  url: string;
}

const USER_AGENT = 'OpenChessLab/0.6 (https://github.com/adibbanyasad-create/OpenChessLab)';

export async function fetchChessComGames(username: string, limit = 10): Promise<OnlineGameItem[]> {
  const cleanUser = username.trim().toLowerCase();
  if (!cleanUser) throw new Error('Enter a Chess.com username.');

  const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUser)}/games/archives`;
  const archivesRes = await fetch(archivesUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  });
  if (archivesRes.status === 404) throw new Error(`Chess.com user "${username}" was not found.`);
  if (!archivesRes.ok) throw new Error(`Chess.com API error (HTTP ${archivesRes.status}).`);

  const { archives } = (await archivesRes.json()) as { archives?: string[] };
  if (!archives || !archives.length) return [];

  // Fetch the latest monthly archive, and previous month if needed to reach `limit`.
  const collected: OnlineGameItem[] = [];
  const targetArchives = archives.slice(-2).reverse();

  for (const archiveUrl of targetArchives) {
    if (collected.length >= limit) break;
    try {
      const gamesRes = await fetch(archiveUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      });
      if (!gamesRes.ok) continue;
      const { games } = (await gamesRes.json()) as {
        games?: {
          url: string;
          pgn?: string;
          time_control?: string;
          time_class?: string;
          end_time?: number;
          white?: { username: string; rating?: number; result?: string };
          black?: { username: string; rating?: number; result?: string };
        }[];
      };
      if (!games || !games.length) continue;

      // Newest games first in the archive.
      const sorted = [...games].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
      for (const game of sorted) {
        if (!game.pgn) continue;
        const idMatch = /\/(\d+)(?:\?|$)/.exec(game.url);
        const id = idMatch ? idMatch[1]! : String(game.end_time ?? collected.length);
        const dateStr = game.end_time
          ? new Date(game.end_time * 1000).toLocaleDateString()
          : 'Recent';

        collected.push({
          id,
          platform: 'chesscom',
          white: {
            username: game.white?.username ?? 'White',
            rating: game.white?.rating,
            result: game.white?.result,
          },
          black: {
            username: game.black?.username ?? 'Black',
            rating: game.black?.rating,
            result: game.black?.result,
          },
          timeControl: game.time_control ?? game.time_class ?? 'Standard',
          timeClass: game.time_class,
          date: dateStr,
          result:
            game.white?.result === 'win' ? '1-0' : game.black?.result === 'win' ? '0-1' : '1/2-1/2',
          pgn: game.pgn,
          url: game.url,
        });
        if (collected.length >= limit) break;
      }
    } catch {
      /* Continue with whatever games were retrieved. */
    }
  }

  return collected;
}

export async function fetchLichessGames(username: string, limit = 10): Promise<OnlineGameItem[]> {
  const cleanUser = username.trim().toLowerCase();
  if (!cleanUser) throw new Error('Enter a Lichess username.');

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(cleanUser)}?max=${limit}&clocks=false&evals=false&opening=false`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/x-chess-pgn',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (res.status === 404) throw new Error(`Lichess user "${username}" was not found.`);
  if (!res.ok) throw new Error(`Lichess API error (HTTP ${res.status}).`);

  const pgnBlob = await res.text();
  if (!pgnBlob.trim()) return [];

  const rawGames = pgnBlob
    .split(/\n\n\n+/)
    .map((g) => g.trim())
    .filter((g) => g.startsWith('[Event '));

  const items: OnlineGameItem[] = [];
  for (const raw of rawGames) {
    try {
      const parsed = parseGame(raw);
      const h = parsed.headers;
      const gameUrl = h.Site ?? '';
      const idMatch = /\/([a-zA-Z0-9]{8,12})(?:\?|$)/.exec(gameUrl);
      const id = idMatch ? idMatch[1]! : `lichess-${items.length}`;

      items.push({
        id,
        platform: 'lichess',
        white: {
          username: h.White ?? 'White',
          rating: h.WhiteElo ? Number(h.WhiteElo) : undefined,
          result: h.Result === '1-0' ? 'win' : h.Result === '0-1' ? 'loss' : 'draw',
        },
        black: {
          username: h.Black ?? 'Black',
          rating: h.BlackElo ? Number(h.BlackElo) : undefined,
          result: h.Result === '0-1' ? 'win' : h.Result === '1-0' ? 'loss' : 'draw',
        },
        timeControl: h.TimeControl ?? 'Standard',
        date: h.Date ?? 'Recent',
        result: h.Result ?? '*',
        pgn: parsed.pgn,
        url: gameUrl || `https://lichess.org/${id}`,
      });
    } catch {
      /* Skip any corrupted or non-standard PGN chunks. */
    }
  }

  return items;
}

export async function fetchGameByUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  // Lichess game URL or 8-char game ID: e.g. https://lichess.org/L07dBpjM or L07dBpjM
  const lichessMatch = /(?:lichess\.org\/|^)([a-zA-Z0-9]{8})(?:[#/?]|$)/.exec(trimmed);
  if (lichessMatch) {
    const id = lichessMatch[1]!;
    const res = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false`, {
      headers: { Accept: 'application/x-chess-pgn', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Could not fetch Lichess game ${id} (HTTP ${res.status}).`);
    return await res.text();
  }

  throw new Error('Unsupported game URL. Enter a Lichess game link or use the username search.');
}
