import { useState, type FormEvent } from 'react';
import {
  FileUp,
  Upload,
  ClipboardPaste,
  ArrowRight,
  Globe,
  LoaderCircle,
  Link as LinkIcon,
} from 'lucide-react';
import { api } from '../api';
import { gameFromFen, OPERA_PGN, parseGame } from '../../shared/chess';
import type { GameData } from '../../shared/types';
import { LIMITS } from '../../shared/limits';
import {
  fetchChessComGames,
  fetchGameByUrl,
  fetchLichessGames,
  type OnlineGameItem,
} from '../onlineSync';
import { Modal } from './Modal';

export function ImportDialog({
  onClose,
  onImport,
  initialTab = 'pgn',
}: {
  onClose: () => void;
  onImport: (game: GameData) => void;
  initialTab?: 'pgn' | 'fen' | 'online';
}) {
  const [tab, setTab] = useState<'pgn' | 'fen' | 'online'>(initialTab);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Online sync state
  const [platform, setPlatform] = useState<'chesscom' | 'lichess'>('chesscom');
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('ocl-online-username-v1') ?? '';
    } catch {
      return '';
    }
  });
  const [gameUrlInput, setGameUrlInput] = useState('');
  const [onlineGames, setOnlineGames] = useState<OnlineGameItem[]>([]);
  const [fetchingOnline, setFetchingOnline] = useState(false);

  const fetchUserGames = async () => {
    const targetUser = username.trim();
    if (!targetUser) {
      setError('Please enter a username.');
      return;
    }
    setError('');
    setFetchingOnline(true);
    try {
      try {
        localStorage.setItem('ocl-online-username-v1', targetUser);
      } catch {
        /* Storage failure is non-fatal. */
      }
      const games =
        platform === 'chesscom'
          ? await fetchChessComGames(targetUser, 10)
          : await fetchLichessGames(targetUser, 10);
      if (!games.length) {
        setError(
          `No recent games found for ${targetUser} on ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'}.`,
        );
      }
      setOnlineGames(games);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not fetch games.');
    } finally {
      setFetchingOnline(false);
    }
  };

  const loadUrl = async () => {
    const trimmed = gameUrlInput.trim();
    if (!trimmed) {
      setError('Please enter a game link.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const pgn = await fetchGameByUrl(trimmed);
      const game = parseGame(pgn);
      onImport(game);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load game from link.');
    } finally {
      setBusy(false);
    }
  };

  const importOnlineGame = (gameItem: OnlineGameItem) => {
    try {
      const game = parseGame(gameItem.pgn);
      onImport(game);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to parse game PGN.');
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      let game: GameData;
      if (tab === 'fen') {
        game = gameFromFen(text.trim());
      } else {
        try {
          game = await api<GameData>('/games/parse', {
            method: 'POST',
            body: JSON.stringify({ pgn: text }),
          });
        } catch {
          // Offline fallback: the shared parser validates identically.
          game = parseGame(text);
        }
      }
      onImport(game);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to import this game.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Bring a position to life"
      description="Import a game or start from a position. Your next discovery is a move away."
      onClose={onClose}
    >
      <div className="segmented-control">
        <button
          className={tab === 'pgn' ? 'active' : ''}
          onClick={() => {
            setTab('pgn');
            setText('');
            setError('');
          }}
        >
          <FileUp size={16} />
          PGN game
        </button>
        <button
          className={tab === 'fen' ? 'active' : ''}
          onClick={() => {
            setTab('fen');
            setText('');
            setError('');
          }}
        >
          <ClipboardPaste size={16} />
          FEN position
        </button>
        <button
          className={tab === 'online' ? 'active' : ''}
          onClick={() => {
            setTab('online');
            setText('');
            setError('');
          }}
        >
          <Globe size={16} />
          Chess.com / Lichess
        </button>
      </div>
      {tab === 'online' ? (
        <div className="online-sync-pane">
          <div className="online-platform-selector">
            <button
              type="button"
              className={`platform-btn ${platform === 'chesscom' ? 'active' : ''}`}
              onClick={() => {
                setPlatform('chesscom');
                setOnlineGames([]);
                setError('');
              }}
            >
              <strong>Chess.com</strong>
            </button>
            <button
              type="button"
              className={`platform-btn ${platform === 'lichess' ? 'active' : ''}`}
              onClick={() => {
                setPlatform('lichess');
                setOnlineGames([]);
                setError('');
              }}
            >
              <strong>Lichess</strong>
            </button>
          </div>

          <div className="online-search-row">
            <input
              id="online-username"
              type="text"
              className="text-input"
              placeholder={`Enter ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'} username`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void fetchUserGames();
                }
              }}
              disabled={fetchingOnline}
            />
            <button
              type="button"
              className="button primary small"
              onClick={fetchUserGames}
              disabled={fetchingOnline || !username.trim()}
            >
              {fetchingOnline ? <LoaderCircle size={14} className="spin" /> : <Globe size={14} />}
              {fetchingOnline ? 'Fetching...' : 'Fetch games'}
            </button>
          </div>

          {onlineGames.length > 0 && (
            <div className="online-games-list" role="region" aria-label="Fetched online games">
              <span className="online-list-title">Recent games (click to review)</span>
              {onlineGames.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className="online-game-card"
                  onClick={() => importOnlineGame(g)}
                  title="Load this game into the workspace"
                >
                  <div className="online-game-players">
                    <span className="player-vs">
                      <strong>{g.white.username}</strong>
                      {g.white.rating && <small> ({g.white.rating})</small>}
                      <span className="vs"> vs </span>
                      <strong>{g.black.username}</strong>
                      {g.black.rating && <small> ({g.black.rating})</small>}
                    </span>
                  </div>
                  <div className="online-game-meta">
                    <span
                      className={`result-tag ${g.result === '1-0' ? 'white-win' : g.result === '0-1' ? 'black-win' : 'draw'}`}
                    >
                      {g.result}
                    </span>
                    <span className="time-tag">{g.timeControl}</span>
                    <span className="date-tag">{g.date}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="online-url-row">
            <span className="field-label">Or load by direct game link:</span>
            <div className="url-input-group">
              <input
                type="text"
                className="text-input"
                placeholder="e.g. https://lichess.org/L07dBpjM"
                value={gameUrlInput}
                onChange={(e) => setGameUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void loadUrl();
                  }
                }}
                disabled={busy}
              />
              <button
                type="button"
                className="button secondary small"
                onClick={loadUrl}
                disabled={busy || !gameUrlInput.trim()}
              >
                <LinkIcon size={14} />
                Load URL
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label className="field-label" htmlFor="import-text">
            {tab === 'pgn' ? 'Paste your game notation' : 'Paste your FEN position'}
          </label>
          <textarea
            id="import-text"
            data-autofocus
            rows={tab === 'pgn' ? 8 : 4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={LIMITS.pgnBytes}
            spellCheck={false}
            placeholder={
              tab === 'pgn'
                ? '[White "Player one"]\n[Black "Player two"]\n\n1. e4 e5 2. Nf3 Nc6 ...'
                : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            }
          />
          {tab === 'pgn' && (
            <div className="import-file-row">
              <label className="button secondary small file-upload">
                <Upload size={15} />
                Choose .pgn file
                <input
                  type="file"
                  accept=".pgn,text/plain,application/x-chess-pgn"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > LIMITS.pgnBytes) {
                      setError('Files must be smaller than 256 KB.');
                      return;
                    }
                    void file
                      .text()
                      .then(setText)
                      .catch(() => setError('Unable to read this file.'));
                  }}
                />
              </label>
              <span className="tiny muted">One game, up to 256 KB</span>
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTab('pgn');
                setText(OPERA_PGN);
                setError('');
              }}
            >
              Try the Opera Game
            </button>
            <button className="button primary" type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Importing...' : 'Open in workspace'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
