import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  CircleHelp,
  Clipboard,
  Code2,
  Cpu,
  Download,
  FileText,
  FlaskConical,
  GitCompareArrows,
  Keyboard,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Settings2,
  ShieldCheck,
  Terminal,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Chess } from 'chess.js';
import { branchGame, DEFAULT_POSITION, gameFromFen, OPERA_PGN, parseGame } from '../shared/chess';
import type {
  AnalysisResult,
  EngineDescriptor,
  GameData,
  ReviewResult,
  SearchSettings,
} from '../shared/types';
import { api, downloadFile, getToken, setToken } from './api';
import { nativeConfirmExit, nativeTap, useNativeChrome } from './native';
import { isSoundEnabled, playSound, setSoundEnabled } from './sounds';
import { isOfflineEngineAvailable, useOfflineJob } from './offlineEngine';
import { useRemoteJob } from './useRemoteJob';
import { BrandMark, ChessPiece } from './components/ChessPiece';
import { ChessBoard } from './components/ChessBoard';
import { EnginePanel } from './components/EnginePanel';
import { MoveList } from './components/MoveList';
import { EvaluationChart } from './components/EvaluationChart';
import { ImportDialog } from './components/ImportDialog';
import { EngineGuideDialog } from './components/EngineGuideDialog';
import { Modal } from './components/Modal';
const Experiments = lazy(() =>
  import('./pages/Experiments').then((page) => ({ default: page.Experiments })),
);
const Documentation = lazy(() =>
  import('./pages/Documentation').then((page) => ({ default: page.Documentation })),
);

type View = 'analysis' | 'compare' | 'benchmark' | 'docs';
type Dialog = 'import' | 'fen' | 'shortcuts' | 'connection' | 'game' | 'new' | 'engine' | null;
const navigation = [
  { id: 'analysis', label: 'Analysis board', icon: LayoutGrid },
  { id: 'compare', label: 'Engine arena', icon: GitCompareArrows },
  { id: 'benchmark', label: 'Benchmarks', icon: BarChart3 },
] as const;

function restoredWorkspace(): { game: GameData; ply: number } {
  try {
    const data: unknown = JSON.parse(localStorage.getItem('ocl-workspace-v1') ?? 'null');
    if (
      data &&
      typeof data === 'object' &&
      'pgn' in data &&
      typeof data.pgn === 'string' &&
      'ply' in data &&
      typeof data.ply === 'number' &&
      Number.isInteger(data.ply)
    ) {
      const game = parseGame(data.pgn);
      return { game, ply: Math.max(0, Math.min(data.ply, game.moves.length)) };
    }
  } catch {
    /* Corrupt or unavailable browser storage must not prevent startup. */
  }
  return { game: parseGame(OPERA_PGN), ply: 16 };
}

export function App() {
  const [workspace, setWorkspace] = useState(restoredWorkspace);
  const { game, ply } = workspace;
  const [view, setView] = useState<View>('analysis');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [flipped, setFlipped] = useState(false);
  const [showArrow, setShowArrow] = useState(false);
  const [live, setLive] = useState(true);
  const [engineId, setEngineId] = useState('stockfish-lite');
  const [engines, setEngines] = useState<EngineDescriptor[]>([]);
  const [connection, setConnection] = useState('Connecting');
  const [connectionError, setConnectionError] = useState('');
  const [tokenInput, setTokenInput] = useState(getToken);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [settings, setSettings] = useState<SearchSettings>({
    depth: 14,
    threads: 1,
    hash: 64,
    multiPv: 3,
  });
  const [searchedKey, setSearchedKey] = useState('');
  const reviewIntent = useRef(0);
  const moveFocus = useRef<string | null>(null);
  const [reviewedPgn, setReviewedPgn] = useState('');
  const [toast, setToast] = useState('');
  const [doc, setDoc] = useState('overview');
  const [sound, setSound] = useState(isSoundEnabled);
  const announcedReview = useRef('');
  const analysis = useRemoteJob<AnalysisResult>();
  const reviewJob = useRemoteJob<ReviewResult>();
  const offline = useOfflineJob();
  useNativeChrome();
  useEffect(() => nativeConfirmExit(() => window.close()), []);
  const OFFLINE_ID = 'stockfish-offline';
  const offlineActive = engineId === OFFLINE_ID;
  const fen = game.positions[ply] ?? game.initialFen;
  const chess = new Chess(fen);
  const isSample = game.headers.Event === 'A Night at the Opera';
  const review = reviewedPgn === game.pgn ? reviewJob.job?.result : undefined;
  const customOptionsKey = JSON.stringify(
    Object.entries(settings.options ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const searchKey = `${fen}|${engineId}|${settings.depth}|${settings.threads}|${settings.hash}|${settings.multiPv}|${customOptionsKey}`;
  const remoteResult =
    searchedKey === searchKey && analysis.job?.result?.fen === fen
      ? analysis.job.result
      : undefined;
  const offlineResult =
    searchedKey === searchKey && offline.result?.fen === fen ? offline.result : undefined;
  const result = offlineActive ? offlineResult : remoteResult;
  const lines =
    searchedKey === searchKey
      ? (result?.lines ?? (offlineActive ? offline.lines : (analysis.job?.progress.lines ?? [])))
      : [];
  const analysisBusy = offlineActive ? offline.busy : analysis.busy;
  const analysisError = offlineActive ? offline.error : analysis.error;
  const analysisStopped = offlineActive ? offline.stopped : analysis.stopped;
  const currentScore = lines[0]?.score ?? review?.scores[ply]?.score;
  const reviewBusy = reviewJob.busy;
  const setPly = (next: number) =>
    startTransition(() =>
      setWorkspace((current) => ({
        ...current,
        ply: Math.max(0, Math.min(next, current.game.moves.length)),
      })),
    );

  useEffect(() => {
    if (moveFocus.current) {
      document.getElementById(`square-${moveFocus.current}`)?.focus({ preventScroll: true });
      moveFocus.current = null;
    }
  }, [fen, flipped]);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ engines: EngineDescriptor[] }>('/engines', { signal: controller.signal })
      .then((data) => {
        setEngines(data.engines);
        setConnection('Engine service online');
        setConnectionError('');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          // No server: fall back to the bundled offline engine so the
          // installable apps and server-less previews keep working.
          if (isOfflineEngineAvailable()) {
            setEngines([
              {
                id: OFFLINE_ID,
                name: 'Stockfish 19 Lite (offline)',
                description: 'Runs on this device. Single-threaded, no server needed.',
                kind: 'wasm',
              },
            ]);
            setEngineId(OFFLINE_ID);
            setConnection('Offline engine ready');
            setConnectionError('');
          } else {
            setConnection('Connection needed');
            setConnectionError(error instanceof Error ? error.message : 'Unable to connect.');
          }
        }
      });
    return () => controller.abort();
  }, [connectionRevision]);

  useEffect(() => {
    try {
      localStorage.setItem('ocl-workspace-v1', JSON.stringify({ pgn: game.pgn, ply }));
    } catch {
      /* Export remains available when browser storage is disabled. */
    }
  }, [game.pgn, ply]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4_000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!review || reviewJob.busy || announcedReview.current === reviewedPgn) return;
    announcedReview.current = reviewedPgn;
    const brilliant = review.annotations.some(
      (annotation) => !annotation.uncertain && annotation.classification === 'brilliant',
    );
    playSound(brilliant ? 'brilliant' : 'review');
  }, [review, reviewJob.busy, reviewedPgn]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) playSound('select');
  };

  const startAnalysis = () => {
    setSearchedKey(searchKey);
    if (offlineActive) {
      void offline.run({
        fen,
        depth: Math.min(settings.depth, 18),
        multiPv: settings.multiPv,
        timeLimitMs: 3_000,
      });
      return;
    }
    void analysis.run('/analysis', { fen, engineId, ...settings });
  };
  const autoAnalyze = useEffectEvent(startAnalysis);
  const cancelAnalysis = offlineActive ? offline.cancel : analysis.cancel;
  useEffect(() => {
    const timer =
      live && view === 'analysis' && !reviewBusy && engines.length
        ? setTimeout(() => autoAnalyze(), 500)
        : undefined;
    return () => {
      clearTimeout(timer);
      void cancelAnalysis();
    };
  }, [fen, settings, engineId, live, view, reviewBusy, engines.length, cancelAnalysis]);

  const flipBoard = () => {
    const focused = document.activeElement?.id;
    moveFocus.current = focused?.startsWith('square-') ? focused.slice(7) : null;
    setFlipped((value) => !value);
  };

  const keyboardNavigation = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      dialog ||
      document.querySelector('dialog[open]') ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable]'))
    )
      return;
    if (event.key === 'a') {
      navigate('analysis');
      return;
    }
    if (view !== 'analysis') return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPly(ply - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPly(ply + 1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setPly(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setPly(game.moves.length);
    }
    if (event.key === 'f') flipBoard();
    if (event.key === '?') setDialog('shortcuts');
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyboardNavigation(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const changeGame = (next: GameData, nextPly = next.moves.length) => {
    moveFocus.current = null;
    reviewIntent.current++;
    void analysis.cancel();
    void offline.cancel();
    void reviewJob.cancel();
    setReviewedPgn('');
    setSearchedKey('');
    startTransition(() => {
      setWorkspace({ game: next, ply: nextPly });
      setView('analysis');
    });
  };
  const playMove = (move: string) => {
    try {
      changeGame(branchGame(game, ply, move));
      moveFocus.current = move.slice(2, 4);
      nativeTap();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'This move is not legal.');
    }
  };
  const navigate = (next: View) => {
    if (next !== 'analysis') {
      reviewIntent.current++;
      void analysis.cancel();
      void offline.cancel();
      void reviewJob.cancel();
    }
    setView(next);
    if (next !== view) window.scrollTo({ top: 0 });
  };
  const openDocs = (section = 'overview') => {
    setDoc(section);
    navigate('docs');
  };
  const reviewGame = async () => {
    const intent = ++reviewIntent.current;
    if (reviewJob.busy) {
      await reviewJob.cancel();
      return;
    }
    if (offlineActive) {
      setToast('Game reviews need the engine service. Analysis works offline.');
      return;
    }
    setLive(false);
    await analysis.cancel();
    if (intent !== reviewIntent.current) return;
    setReviewedPgn(game.pgn);
    await reviewJob.run('/reviews', {
      pgn: game.pgn,
      engineId,
      ...settings,
      depth: Math.min(settings.depth, 10),
      multiPv: 1,
    });
  };
  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setToast('FEN copied to clipboard.');
    } catch {
      setDialog('game');
      setToast('Clipboard unavailable. The FEN is shown in game details.');
    }
  };
  const exportReview = async () => {
    const id = reviewJob.job?.id;
    if (!review || !id) return;
    try {
      const token = getToken();
      const response = await fetch(`/api/jobs/${id}/export?format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error('Review export is unavailable.');
      const text = await response.text();
      downloadFile(`openchesslab-review-${id}.csv`, text, 'text/csv');
      setToast('Review exported.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Review export is unavailable.');
    }
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('analysis')}
          aria-label="OpenChessLab home"
        >
          <BrandMark />
          <span>
            OpenChess<span className="brand-light">Lab</span>
            <small>THE OPEN CHESS WORKSPACE</small>
          </span>
        </button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${view === id ? 'active' : ''}`}
              aria-label={label}
              aria-current={view === id ? 'page' : undefined}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {id === 'analysis' && <span className="nav-shortcut">A</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label resources-label">RESOURCES</div>
        <nav aria-label="Resources">
          <button
            className={`nav-item ${view === 'docs' ? 'active' : ''}`}
            aria-label="Documentation"
            onClick={() => openDocs()}
            aria-current={view === 'docs' ? 'page' : undefined}
          >
            <BookOpen size={18} strokeWidth={1.7} />
            <span>Documentation</span>
            <ArrowUpRight className="nav-arrow" size={13} />
          </button>
          <button
            className="nav-item"
            aria-label="Contribute"
            onClick={() => openDocs('contributing')}
          >
            <Code2 size={18} strokeWidth={1.7} />
            <span>Contribute</span>
            <ArrowUpRight className="nav-arrow" size={13} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="open-source-card">
            <span className="open-source-icon">
              <FlaskConical size={20} strokeWidth={1.5} />
            </span>
            <h3>Built for curious minds.</h3>
            <p>
              Open source. Open possibilities.
              <br />
              Make your next discovery.
            </p>
            <button onClick={() => openDocs('overview')}>
              Explore the project
              <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className="local-workspace"
            aria-label="Connection settings"
            onClick={() => setDialog('connection')}
          >
            <span className="workspace-avatar">L</span>
            <span>
              <strong>Local workspace</strong>
              <small>No account required</small>
            </span>
            <Settings2 size={16} />
          </button>
          <div className="sidebar-version">
            <span className="status-dot" />
            OpenChessLab <span>v{__APP_VERSION__}</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span className="breadcrumb-icon">
              <LayoutGrid size={15} />
            </span>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>
              {view === 'analysis'
                ? 'Analysis'
                : view === 'compare'
                  ? 'Engine arena'
                  : view === 'benchmark'
                    ? 'Benchmarks'
                    : 'Documentation'}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className={`connection-status ${connectionError ? 'offline' : ''}`}
              onClick={() => setDialog('connection')}
            >
              <span className="status-dot" />
              {connection}
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              onClick={toggleSound}
              aria-label={sound ? 'Mute sounds' : 'Enable sounds'}
              aria-pressed={sound}
              title={sound ? 'Mute sounds' : 'Enable sounds'}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              className="icon-button"
              onClick={() => setDialog('shortcuts')}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <Keyboard size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => openDocs('usage')}
              aria-label="Help"
              title="Help"
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main id="main-content">
          <Suspense
            fallback={
              <div className="page-loading" role="status">
                Opening workspace...
              </div>
            }
          >
            {view === 'analysis' ? (
              <>
                <div className="page-heading analysis-heading">
                  <div>
                    <div className="eyebrow">A LITTLE CURIOSITY. A BETTER NEXT MOVE.</div>
                    <h1>Think one move further.</h1>
                    <p>
                      Your space to explore positions, understand games, and find the best move.
                    </p>
                  </div>
                  <div className="heading-actions">
                    <button className="button secondary" onClick={() => setDialog('import')}>
                      <Upload size={16} />
                      Import game
                    </button>
                    <button className="button primary" onClick={() => setDialog('new')}>
                      <Plus size={17} />
                      New analysis
                    </button>
                  </div>
                </div>
                {connectionError && (
                  <div className="connection-banner" role="alert">
                    <Terminal size={18} />
                    <span>{connectionError}</span>
                    <button className="text-button" onClick={() => setDialog('connection')}>
                      Connection settings
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                <div className="workspace-tabs">
                  <div className="workspace-tab">
                    <LayoutGrid size={15} />
                    Analysis board
                  </div>
                  <span className="workspace-mode">
                    {isSample ? 'THE OPERA GAME' : 'YOUR WORKSPACE'}
                  </span>
                  <button className="text-button" onClick={() => setDialog('fen')}>
                    <Clipboard size={14} />
                    Load FEN
                  </button>
                </div>
                <div className="analysis-layout">
                  <div className="board-column">
                    <section className="card board-card">
                      <div className="board-card-heading">
                        <div>
                          <h2>
                            {isSample
                              ? 'The Opera Game'
                              : game.headers.Event && game.headers.Event !== '?'
                                ? game.headers.Event
                                : 'Board explorer'}
                          </h2>
                          <span className="game-context">
                            {isSample
                              ? 'Paris, 1858'
                              : game.moves.length
                                ? `${game.moves.length} half-moves to explore`
                                : 'Every great game starts here'}
                          </span>
                        </div>
                        <div className="board-heading-actions">
                          {isSample && <span className="example-badge">Classic game</span>}
                          <button
                            className="icon-button small"
                            onClick={() => setDialog('game')}
                            aria-label="Game details"
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        </div>
                      </div>
                      <div
                        className={`player-row top-player ${chess.turn() === (flipped ? 'w' : 'b') ? 'side-to-move' : ''}`}
                      >
                        <span
                          className={`player-avatar ${flipped ? 'white-player' : 'black-player'}`}
                        >
                          <ChessPiece type="k" color={flipped ? 'b' : 'w'} />
                        </span>
                        <div>
                          <strong>
                            {flipped
                              ? game.headers.White && game.headers.White !== '?'
                                ? game.headers.White
                                : 'White'
                              : isSample
                                ? 'Brunswick & Isouard'
                                : game.headers.Black && game.headers.Black !== '?'
                                  ? game.headers.Black
                                  : 'Black'}
                          </strong>
                          <span>{flipped ? 'White pieces' : 'Black pieces'}</span>
                        </div>
                        <span className="player-side-indicator">
                          {chess.turn() === (flipped ? 'w' : 'b') ? (
                            <>
                              <span className="turn-dot" />
                              To move
                            </>
                          ) : (
                            <span className="player-side-dash">&middot;</span>
                          )}
                        </span>
                      </div>
                      <ChessBoard
                        key={`${fen}-${flipped}`}
                        fen={fen}
                        flipped={flipped}
                        onMove={playMove}
                        score={currentScore}
                        lastMove={game.moves[ply - 1]}
                        bestMove={result?.bestMove ?? lines[0]?.pv[0]}
                        showArrow={showArrow}
                      />
                      <div
                        className={`player-row bottom-player ${chess.turn() === (flipped ? 'b' : 'w') ? 'side-to-move' : ''}`}
                      >
                        <span
                          className={`player-avatar ${flipped ? 'black-player' : 'white-player'}`}
                        >
                          <ChessPiece type="k" color={flipped ? 'w' : 'b'} />
                        </span>
                        <div>
                          <strong>
                            {flipped
                              ? isSample
                                ? 'Brunswick & Isouard'
                                : game.headers.Black && game.headers.Black !== '?'
                                  ? game.headers.Black
                                  : 'Black'
                              : game.headers.White && game.headers.White !== '?'
                                ? game.headers.White
                                : 'White'}
                          </strong>
                          <span>{flipped ? 'Black pieces' : 'White pieces'}</span>
                        </div>
                        <span className="player-side-indicator">
                          {chess.turn() === (flipped ? 'b' : 'w') ? (
                            <>
                              <span className="turn-dot" />
                              To move
                            </>
                          ) : (
                            <span className="player-side-dash">&middot;</span>
                          )}
                        </span>
                      </div>
                      <div className="board-controls">
                        <button
                          className="icon-button"
                          onClick={flipBoard}
                          aria-label="Flip board"
                          title="Flip board (F)"
                        >
                          <ArrowLeftRight size={17} />
                        </button>
                        <div className="move-controls">
                          <button
                            className="icon-button"
                            disabled={ply === 0}
                            onClick={() => setPly(0)}
                            aria-label="First position"
                          >
                            <ChevronsLeft size={18} />
                          </button>
                          <button
                            className="icon-button"
                            disabled={ply === 0}
                            onClick={() => setPly(ply - 1)}
                            aria-label="Previous move"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <span className="move-position">
                            {ply} <span>/ {game.moves.length}</span>
                          </span>
                          <button
                            className="icon-button"
                            disabled={ply === game.moves.length}
                            onClick={() => setPly(ply + 1)}
                            aria-label="Next move"
                          >
                            <ChevronRight size={20} />
                          </button>
                          <button
                            className="icon-button"
                            disabled={ply === game.moves.length}
                            onClick={() => setPly(game.moves.length)}
                            aria-label="Last position"
                          >
                            <ChevronsRight size={18} />
                          </button>
                        </div>
                        <button
                          className={`icon-button ${showArrow ? 'toggled' : ''}`}
                          onClick={() => setShowArrow(!showArrow)}
                          aria-label="Show best move arrow"
                          aria-pressed={showArrow}
                          title="Show best move"
                        >
                          <ArrowUpRight size={20} />
                        </button>
                      </div>
                    </section>
                    <EvaluationChart
                      review={review}
                      ply={ply}
                      total={game.moves.length}
                      current={currentScore}
                      onSelect={setPly}
                      onReview={() => {
                        void reviewGame();
                      }}
                      busy={reviewJob.busy}
                    />
                    <div className="board-bottom-note">
                      <span>
                        <ShieldCheck size={13} />
                        Local-first. No account required.
                      </span>
                      <button
                        className="text-button tiny"
                        onClick={() => {
                          void copyFen();
                        }}
                      >
                        <Clipboard size={12} />
                        Copy FEN
                      </button>
                    </div>
                  </div>
                  <div className="analysis-column">
                    <EnginePanel
                      engines={engines}
                      engineId={engineId}
                      setEngineId={setEngineId}
                      settings={settings}
                      setSettings={setSettings}
                      lines={lines}
                      result={result}
                      busy={analysisBusy}
                      error={searchedKey === searchKey ? analysisError : ''}
                      stopped={searchedKey === searchKey && analysisStopped}
                      live={live}
                      setLive={setLive}
                      run={startAnalysis}
                      stop={() => {
                        setLive(false);
                        if (offlineActive) void offline.cancel();
                        else void analysis.cancel();
                      }}
                      onMove={playMove}
                      onDocs={() => openDocs('configuration')}
                    />
                    <MoveList
                      game={game}
                      ply={ply}
                      setPly={setPly}
                      review={review}
                      busy={reviewJob.busy}
                      progress={reviewJob.job?.progress.message}
                      onReview={() => {
                        void reviewGame();
                      }}
                      onExport={() =>
                        downloadFile('openchesslab-game.pgn', game.pgn, 'application/x-chess-pgn')
                      }
                      onExportReview={() => {
                        void exportReview();
                      }}
                    />
                    {reviewJob.error && (
                      <div className="error-message" role="alert">
                        {reviewJob.error}
                      </div>
                    )}
                    {review && (
                      <p className="review-disclaimer">
                        Move labels are depth-dependent estimates at up to {review.settings.depth}{' '}
                        plies, not definitive judgments.
                        {review.scores.some((point) => point.depthLimited)
                          ? ' Some positions did not confirm the requested depth.'
                          : ''}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : view === 'docs' ? (
              <Documentation selected={doc} onSelect={setDoc} />
            ) : (
              <Experiments
                key={view}
                mode={view}
                engines={engines}
                fen={fen}
                onDocs={() => openDocs(view === 'benchmark' ? 'benchmarking' : 'configuration')}
                onAddEngine={() => setDialog('engine')}
              />
            )}
          </Suspense>
          <footer className="main-footer">
            <span>Made for the love of the game.</span>
            <span>
              Open source <i /> MIT licensed <i /> Always exploring.
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? 'active' : ''}
            onClick={() => navigate(id)}
            aria-label={label}
          >
            <Icon size={20} />
            <span>
              {id === 'analysis' ? 'Analysis' : id === 'compare' ? 'Engines' : 'Benchmarks'}
            </span>
          </button>
        ))}
        <button
          className={view === 'docs' ? 'active' : ''}
          onClick={() => openDocs()}
          aria-label="Documentation"
        >
          <BookOpen size={20} />
          <span>Docs</span>
        </button>
      </nav>
      {(dialog === 'import' || dialog === 'fen') && (
        <ImportDialog
          initialTab={dialog === 'fen' ? 'fen' : 'pgn'}
          onClose={() => setDialog(null)}
          onImport={(game) => {
            changeGame(game);
            setToast('Your game is ready to explore.');
          }}
        />
      )}
      {dialog === 'engine' && <EngineGuideDialog onClose={() => setDialog(null)} />}
      {dialog === 'new' && (
        <Modal
          title="A fresh perspective"
          description="Start with a clean board, or revisit a timeless game."
          onClose={() => setDialog(null)}
        >
          <div className="new-analysis-options">
            <button
              className="new-analysis-option"
              onClick={() => {
                changeGame(gameFromFen(DEFAULT_POSITION), 0);
                setDialog(null);
              }}
            >
              <LayoutGrid size={26} />
              <strong>Starting position</strong>
              <span>The full board. All the possibilities.</span>
              <ArrowRight size={17} />
            </button>
            <button
              className="new-analysis-option"
              onClick={() => {
                changeGame(parseGame(OPERA_PGN), 16);
                setDialog(null);
              }}
            >
              <BookOpen size={26} />
              <strong>The Opera Game</strong>
              <span>Explore Paul Morphy's 1858 masterpiece.</span>
              <ArrowRight size={17} />
            </button>
          </div>
          <p className="tiny muted">
            This replaces the current workspace. Export your PGN first if you'd like to keep it.
          </p>
          <button
            className="text-button"
            onClick={() =>
              downloadFile('openchesslab-game.pgn', game.pgn, 'application/x-chess-pgn')
            }
          >
            <Download size={14} />
            Export current game
          </button>
        </Modal>
      )}
      {dialog === 'shortcuts' && (
        <Modal
          title="Stay in the flow"
          description="A few small shortcuts for your next big idea."
          onClose={() => setDialog(null)}
        >
          <div className="shortcut-list">
            {[
              ['Previous / next move', '\u2190 / \u2192'],
              ['First / last position', 'Home / End'],
              ['Flip the board', 'F'],
              ['Analysis workspace', 'A'],
              ['Open this guide', '?'],
              ['Close a dialog', 'Esc'],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <div className="inline-note">
            <Keyboard size={16} />
            On the board, use arrow keys to navigate squares and Enter to select a piece or
            destination. On touch screens, tap to move.
          </div>
        </Modal>
      )}
      {dialog === 'connection' && (
        <Modal
          title="Your local engine service"
          description="The browser and UCI engines communicate through the same server. No cloud account is needed."
          onClose={() => setDialog(null)}
        >
          <div className="connection-detail">
            <Cpu size={22} />
            <div>
              <strong>{connection}</strong>
              <span>{engines.length} configured engines</span>
            </div>
            <span className={`status-dot ${connectionError ? 'offline' : ''}`} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setToken(tokenInput.trim());
              setConnectionRevision((value) => value + 1);
              setDialog(null);
              setToast('Connection settings updated.');
            }}
          >
            <label className="field-label" htmlFor="api-token">
              API token <span className="muted">optional on localhost</span>
            </label>
            <input
              id="api-token"
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Token configured on your server"
            />
            <p className="tiny muted">
              Stored in this browser tab's session only. Set OPENCHESSLAB_API_TOKEN on the server to
              require authentication.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDialog(null);
                  openDocs('configuration');
                }}
              >
                Connection guide
                <ArrowUpRight size={13} />
              </button>
              <button className="button primary" type="submit">
                Save & reconnect
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === 'game' && (
        <Modal
          title="A closer look"
          description="Game metadata and the current position."
          onClose={() => setDialog(null)}
        >
          <dl className="game-metadata">
            {Object.entries(game.headers)
              .filter(([key]) => !['FEN', 'SetUp'].includes(key))
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          <label className="field-label" htmlFor="current-fen">
            Current FEN
          </label>
          <textarea id="current-fen" readOnly value={fen} rows={3} className="mono" />
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => {
                void copyFen();
              }}
            >
              <Clipboard size={15} />
              Copy FEN
            </button>
            <button
              className="button primary"
              onClick={() =>
                downloadFile('openchesslab-game.pgn', game.pgn, 'application/x-chess-pgn')
              }
            >
              <FileText size={15} />
              Export PGN
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
