import {
  Cpu,
  Play,
  Square,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpRight,
  LoaderCircle,
  Info,
} from 'lucide-react';
import { formatScore, scoreDescription } from '../../shared/chess';
import type {
  AnalysisResult,
  EngineDescriptor,
  EngineLine,
  SearchSettings,
} from '../../shared/types';

export const compact = (number: number | null | undefined) =>
  number == null
    ? '\u2014'
    : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number);

export function EnginePanel({
  engines,
  engineId,
  setEngineId,
  settings,
  setSettings,
  lines,
  result,
  busy,
  stopped,
  error,
  live,
  setLive,
  run,
  stop,
  onMove,
  onDocs,
}: {
  engines: EngineDescriptor[];
  engineId: string;
  setEngineId: (id: string) => void;
  settings: SearchSettings;
  setSettings: (settings: SearchSettings) => void;
  lines: EngineLine[];
  result?: AnalysisResult;
  busy: boolean;
  stopped: boolean;
  error: string;
  live: boolean;
  setLive: (live: boolean) => void;
  run: () => void;
  stop: () => void;
  onMove: (move: string) => void;
  onDocs: () => void;
}) {
  const first = lines[0];
  return (
    <section className="card engine-card" aria-label="Engine analysis">
      <div className="card-heading">
        <h3>
          <Cpu size={17} />
          Engine analysis
        </h3>
        <span className={`status-label ${busy ? 'working' : result ? 'done' : ''}`}>
          <span className="status-dot" />
          {busy
            ? 'Analyzing'
            : result
              ? 'Complete'
              : stopped
                ? 'Stopped'
                : error
                  ? 'Error'
                  : 'Ready'}
        </span>
      </div>
      <div className="engine-body">
        <div className="engine-picker">
          <span className="engine-icon">
            <Cpu size={19} />
          </span>
          <div>
            <label htmlFor="engine-select" className="sr-only">
              Analysis engine
            </label>
            <select
              id="engine-select"
              value={engineId}
              onChange={(event) => setEngineId(event.target.value)}
            >
              {engines.length ? (
                engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))
              ) : (
                <option value="stockfish-lite">Stockfish 19 Lite</option>
              )}
            </select>
            <span className="tiny muted">
              UCI engine <span className="middle-dot">/</span>{' '}
              {engines.find((engine) => engine.id === engineId)?.kind === 'native'
                ? 'Native binary'
                : 'Local WebAssembly'}
            </span>
          </div>
          <ChevronDown size={15} className="select-chevron" />
        </div>
        <div className="score-block">
          <strong
            className={`main-score ${first?.score.type === 'mate' ? 'mate' : ''}`}
            data-testid="engine-score"
          >
            {formatScore(first?.score)}
          </strong>
          <div>
            <span className="score-verdict">
              {result?.terminal ? 'The position is concluded' : scoreDescription(first?.score)}
            </span>
            <span className="tiny muted">
              {first
                ? 'Evaluation from White\u2019s perspective'
                : 'Explore a position to find your next move'}
            </span>
          </div>
        </div>
        <div className="search-stats">
          <div>
            <span>Depth</span>
            <strong>
              {first?.depth ?? '\u2014'} <small>/ {settings.depth}</small>
            </strong>
          </div>
          <div>
            <span>Nodes / sec</span>
            <strong>{first ? compact(first.nps) : '\u2014'}</strong>
          </div>
          <div>
            <span>Search time</span>
            <strong>
              {first?.timeMs != null ? `${(first.timeMs / 1000).toFixed(2)}` : '\u2014'}
              <small>{first?.timeMs != null ? ' s' : ''}</small>
            </strong>
          </div>
        </div>
        <div className="pv-heading">
          <h4>Principal variations</h4>
          <span className="subtle-tag">
            {lines.length
              ? `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
              : `Up to ${settings.multiPv} lines`}
          </span>
        </div>
        <div className="variations">
          {lines.length ? (
            lines.map((line) => (
              <button
                className="variation"
                key={line.multiPv}
                disabled={!line.pv[0]}
                onClick={() => {
                  if (line.pv[0]) onMove(line.pv[0]);
                }}
                title="Play the first move in this variation"
                aria-label={`Play variation ${line.multiPv}: ${line.san[0] ?? 'no move'}`}
              >
                <span className="variation-eval">{formatScore(line.score)}</span>
                <span className="variation-moves">
                  {line.san.slice(0, 7).map((move, index) => (
                    <span key={index} className={index === 0 ? 'first-move' : ''}>
                      {move}
                    </span>
                  ))}
                  {!line.san.length && <span>No legal continuation</span>}
                </span>
                <ArrowUpRight size={13} />
              </button>
            ))
          ) : (
            <div className="pv-empty">
              {busy ? (
                <>
                  <LoaderCircle size={20} className="spin" />
                  <span>Looking a few moves ahead...</span>
                </>
              ) : (
                <>
                  <Cpu size={22} strokeWidth={1.3} />
                  <span>Your engine's best lines will appear here.</span>
                </>
              )}
            </div>
          )}
        </div>
        {first && !result?.terminal && (
          <p className="pv-hint">Select a variation to play its first move.</p>
        )}
        {result?.warnings.map((warning) => (
          <div className="inline-note" key={warning}>
            <Info size={13} />
            {warning}
          </div>
        ))}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="engine-settings">
        <div className="depth-heading">
          <label htmlFor="analysis-depth">Search depth</label>
          <span className="mono">
            {settings.depth} <span className="muted">plies</span>
          </span>
        </div>
        <input
          id="analysis-depth"
          className="range"
          type="range"
          min="1"
          max="24"
          value={settings.depth}
          onChange={(event) => setSettings({ ...settings, depth: Number(event.target.value) })}
        />
        <div className="range-labels">
          <span>Faster</span>
          <span>Deeper</span>
        </div>
        <details className="advanced-settings">
          <summary>
            <SlidersHorizontal size={14} />
            Advanced settings
            <ChevronDown size={14} />
          </summary>
          <div className="settings-grid">
            <label>
              Threads
              <select
                aria-label="Analysis threads"
                value={settings.threads}
                onChange={(event) =>
                  setSettings({ ...settings, threads: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Hash
              <select
                aria-label="Analysis hash"
                value={settings.hash}
                onChange={(event) => setSettings({ ...settings, hash: Number(event.target.value) })}
              >
                {[16, 32, 64, 128, 256, 512].map((value) => (
                  <option key={value} value={value}>
                    {value} MB
                  </option>
                ))}
              </select>
            </label>
            <label>
              Variations
              <select
                aria-label="Principal variations"
                value={settings.multiPv}
                onChange={(event) =>
                  setSettings({ ...settings, multiPv: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="text-button tiny" onClick={onDocs}>
            How search limits work
            <ArrowUpRight size={12} />
          </button>
        </details>
        <div className="live-analysis-row">
          <label className="switch-label">
            <input
              type="checkbox"
              checked={live}
              onChange={(event) => setLive(event.target.checked)}
            />
            <span className="switch" />
            <span>Live analysis</span>
          </label>
          <button
            className={`button ${busy ? 'secondary' : 'primary'} small`}
            disabled={!engines.length}
            onClick={busy ? stop : run}
          >
            {busy ? <Square size={12} /> : <Play size={13} fill="currentColor" />}
            {busy ? 'Stop' : 'Analyze'}
          </button>
        </div>
      </div>
    </section>
  );
}
