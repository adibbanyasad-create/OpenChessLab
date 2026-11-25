import { useState, type FormEvent } from 'react';
import { FileUp, Upload, ClipboardPaste, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { gameFromFen, OPERA_PGN } from '../../shared/chess';
import type { GameData } from '../../shared/types';
import { LIMITS } from '../../shared/limits';
import { Modal } from './Modal';

export function ImportDialog({
  onClose,
  onImport,
  initialTab = 'pgn',
}: {
  onClose: () => void;
  onImport: (game: GameData) => void;
  initialTab?: 'pgn' | 'fen';
}) {
  const [tab, setTab] = useState(initialTab);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const game =
        tab === 'fen'
          ? gameFromFen(text.trim())
          : await api<GameData>('/games/parse', {
              method: 'POST',
              body: JSON.stringify({ pgn: text }),
            });
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
      </div>
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
    </Modal>
  );
}
