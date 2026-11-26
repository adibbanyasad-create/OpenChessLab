import { useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Cpu,
  FlaskConical,
  GitCompareArrows,
  Info,
  Play,
  Plus,
  Square,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  BENCHMARK_POSITIONS,
  formatScore,
  scoreDisagreementCp,
  validPosition,
} from '../../shared/chess';
import { benchmarkCsv } from '../../shared/csv';
import type { BenchmarkResult, EngineDescriptor, SearchSettings } from '../../shared/types';
import { useRemoteJob } from '../useRemoteJob';
import { downloadFile } from '../api';
import { compact } from '../components/EnginePanel';
import { Modal } from '../components/Modal';
import { clearBenchmarkHistory, readBenchmarkHistory, saveBenchmarkRun } from '../benchmarkHistory';

export function Experiments({
  mode,
  engines,
  fen,
  onDocs,
}: {
  mode: 'compare' | 'benchmark';
  engines: EngineDescriptor[];
  fen: string;
  onDocs: () => void;
}) {
  const [selected, setSelected] = useState(['stockfish-lite', 'stockfish']);
  const [suite, setSuite] = useState(mode === 'benchmark' ? 'standard' : 'current');
  const [customName, setCustomName] = useState('');
  const [customFen, setCustomFen] = useState('');
  const [customError, setCustomError] = useState('');
  const customPositions =
    suite === 'custom'
      ? [{ name: customName.trim() || 'Custom position', fen: customFen.trim() }]
      : [];
  const [settings, setSettings] = useState<Omit<SearchSettings, 'depth'>>({
    threads: 1,
    hash: 64,
    multiPv: 1,
  });
  const [depthInput, setDepthInput] = useState('12');
  const depth = Number(depthInput);
  const validDepth =
    depthInput.trim() !== '' && Number.isInteger(depth) && depth >= 1 && depth <= 24;
  const [saved, setSaved] = useState(readBenchmarkHistory);
  const history = saved.runs;
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedRun, setSelectedRun] = useState<BenchmarkResult>();
  const job = useRemoteJob<BenchmarkResult>();
  const result = selectedRun ?? history[0];
  const execute = async () => {
    if (!validDepth) return;
    if (suite === 'custom') {
      try {
        validPosition(customFen.trim());
        if (customName.trim().length > 80) throw new Error('Name is too long.');
        setCustomError('');
      } catch (error) {
        setCustomError(error instanceof Error ? error.message : 'Invalid position.');
        return;
      }
    }
    setSelectedRun(undefined);
    setHistoryError('');
    const result = await job.run('/benchmarks', {
      ...settings,
      depth,
      engineIds: selected,
      positions:
        suite === 'standard'
          ? BENCHMARK_POSITIONS
          : suite === 'custom'
            ? customPositions
            : [{ name: 'Workspace position', fen }],
    });
    if (result) {
      try {
        setSaved(saveBenchmarkRun(result));
      } catch {
        setHistoryError('This result could not be saved. Export it now to keep a copy.');
      }
      setSelectedRun(result);
    }
  };
  const reportedNps = result?.rows.flatMap((row) => (row.nps === null ? [] : [row.nps])) ?? [];
  const maxNps = Math.max(1, ...reportedNps);
  const engineIds = result ? [...new Set(result.rows.map((row) => row.engineId))] : [];
  const positions = result
    ? [...new Map(result.rows.map((row) => [row.fen, row.position])).entries()]
    : [];
  const progress = job.job?.progress;
  return (
    <div className="experiments-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE ENGINE ROOM</div>
          <h1>
            {mode === 'compare'
              ? 'Different engines. Deeper insight.'
              : 'Performance, without the guesswork.'}
          </h1>
          <p>
            {mode === 'compare'
              ? 'Put your engines side by side. See where their thinking diverges.'
              : 'Real positions. Controlled settings. Results you can reproduce.'}
          </p>
        </div>
        <span className="outline-badge">
          <FlaskConical size={14} />
          UCI laboratory
        </span>
      </div>
      <div className="experiment-layout">
        <section className="card experiment-config">
          <div className="card-heading">
            <h3>
              <FlaskConical size={17} />
              Configure your experiment
            </h3>
          </div>
          <div className="experiment-config-body">
            <div className="field-label">
              Select up to 4 engines <span className="muted">{selected.length} selected</span>
            </div>
            <div className="engine-options" role="group" aria-label="Engines to compare">
              {engines.map((engine) => (
                <label
                  className={`engine-option ${selected.includes(engine.id) ? 'selected' : ''}`}
                  key={engine.id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(engine.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, engine.id]
                          : selected.filter((id) => id !== engine.id),
                      )
                    }
                    disabled={job.busy || (!selected.includes(engine.id) && selected.length >= 4)}
                  />
                  <span className="check-box">
                    {selected.includes(engine.id) && <Check size={13} />}
                  </span>
                  <Cpu size={20} />
                  <span>
                    <strong>{engine.name}</strong>
                    <small>
                      {engine.kind === 'wasm' ? 'WebAssembly / local' : 'Native / local'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button className="text-button add-engine" onClick={onDocs}>
              <Plus size={14} />
              Connect another UCI engine
              <ArrowUpRight size={13} />
            </button>
            <div className="field-divider" />
            <label className="field-label" htmlFor="position-suite">
              Position suite
            </label>
            <div className="select-wrap">
              <select
                id="position-suite"
                value={suite}
                disabled={job.busy}
                onChange={(event) => {
                  setSuite(event.target.value);
                  setCustomError('');
                }}
              >
                <option value="current">Current workspace position</option>
                <option value="standard">Standard suite / 3 positions</option>
                <option value="custom">Custom FEN position</option>
              </select>
              <ChevronDown size={16} />
            </div>
            <p className="tiny muted">
              {suite === 'standard'
                ? 'Opening, middlegame, and rook endgame.'
                : suite === 'custom'
                  ? 'Test one exact FEN of your choice.'
                  : 'Compare evaluations of the position on your board.'}
            </p>
            {suite === 'custom' && (
              <div className="custom-position">
                <label>
                  Position name
                  <input
                    aria-label="Custom position name"
                    value={customName}
                    maxLength={80}
                    placeholder="My test position"
                    onChange={(event) => setCustomName(event.target.value)}
                    disabled={job.busy}
                  />
                </label>
                <label>
                  FEN
                  <textarea
                    aria-label="Custom position FEN"
                    value={customFen}
                    rows={3}
                    spellCheck={false}
                    placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                    onChange={(event) => setCustomFen(event.target.value)}
                    disabled={job.busy}
                  />
                </label>
                {customError && (
                  <p className="error-message" role="alert">
                    {customError}
                  </p>
                )}
              </div>
            )}
            <div className="settings-grid experiment-settings">
              <label>
                Depth
                <input
                  aria-label="Benchmark depth"
                  type="number"
                  min="1"
                  max="24"
                  value={depthInput}
                  inputMode="numeric"
                  aria-invalid={!validDepth}
                  aria-describedby={!validDepth ? 'benchmark-depth-error' : undefined}
                  onChange={(event) => setDepthInput(event.target.value)}
                  disabled={job.busy}
                />
              </label>
              <label>
                Threads
                <select
                  aria-label="Benchmark threads"
                  value={settings.threads}
                  onChange={(event) =>
                    setSettings({ ...settings, threads: Number(event.target.value) })
                  }
                  disabled={job.busy}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Hash
                <select
                  aria-label="Benchmark hash"
                  value={settings.hash}
                  onChange={(event) =>
                    setSettings({ ...settings, hash: Number(event.target.value) })
                  }
                  disabled={job.busy}
                >
                  {[16, 32, 64, 128, 256, 512].map((value) => (
                    <option value={value} key={value}>
                      {value} MB
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!validDepth && (
              <p id="benchmark-depth-error" className="error-message">
                Choose a whole-number depth from 1 to 24.
              </p>
            )}
            <div className="experiment-note">
              <Info size={16} />
              <span>
                Engines run sequentially with a state-reset request per position. Search time
                excludes engine startup.
              </span>
            </div>
            <p className="tiny muted storage-notice">
              Completed runs are saved on this browser when storage is available. Use Clear history
              below to remove them.
            </p>
            {job.error && (
              <div className="error-message" role="alert">
                {job.error}
              </div>
            )}
            <button
              className="button primary run-experiment"
              disabled={
                !job.busy &&
                (!validDepth || !selected.length || !engines.length || selected.length > 4)
              }
              onClick={() => {
                if (job.busy) void job.cancel();
                else void execute();
              }}
            >
              {job.busy ? <Square size={15} /> : <Play size={15} fill="currentColor" />}
              {job.busy
                ? 'Stop experiment'
                : mode === 'compare'
                  ? 'Compare engines'
                  : 'Run benchmark'}
              <span>{job.busy ? '' : `${selected.length} engines`}</span>
            </button>
            {job.busy && (
              <div className="job-progress">
                <div className="progress-track">
                  <div
                    style={{
                      width: `${progress ? (progress.completed / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span role="status">{progress?.message ?? 'Starting experiment...'}</span>
              </div>
            )}
          </div>
        </section>
        <div className="experiment-results">
          <div className="metric-cards">
            <Metric
              icon={<Cpu size={19} />}
              label="Engines tested"
              value={result ? String(engineIds.length) : '\u2014'}
              detail="Per completed run"
            />
            <Metric
              icon={<Zap size={19} />}
              label="Peak throughput"
              value={reportedNps.length ? compact(Math.max(...reportedNps)) : '\u2014'}
              detail="Engine-reported nodes / sec"
            />
            <Metric
              icon={<Timer size={19} />}
              label="Total search time"
              value={
                result
                  ? `${(result.rows.reduce((sum, row) => sum + row.wallTimeMs, 0) / 1000).toFixed(2)}s`
                  : '\u2014'
              }
              detail="Measured wall-clock time"
            />
          </div>
          <section className="card throughput-card">
            <div className="card-heading">
              <h3>
                <Activity size={17} />
                Engine throughput
              </h3>
              <span className="subtle-tag">Nodes per second</span>
            </div>
            {result ? (
              <div className="throughput-chart">
                {result.rows.map((row, index) => (
                  <div className="throughput-row" key={`${row.engineId}-${index}`}>
                    <div>
                      <strong title={row.engineName}>{row.engineName}</strong>
                      <span>{row.position}</span>
                    </div>
                    <div className="throughput-track">
                      <div
                        style={{ width: `${row.nps === null ? 0 : (row.nps / maxNps) * 100}%` }}
                        className={engineIds.indexOf(row.engineId) % 2 ? 'secondary-bar' : ''}
                      />
                    </div>
                    <span
                      className="mono"
                      title={row.nps === null ? 'NPS not reported by this engine' : undefined}
                    >
                      {compact(row.nps)}
                    </span>
                  </div>
                ))}
                <p className="tiny muted">
                  Higher is faster, not necessarily stronger. Engine builds and search algorithms
                  affect node counts.
                </p>
              </div>
            ) : (
              <div className="experiment-empty">
                <div className="empty-chart">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <h3>Let the engines do the talking.</h3>
                <p>
                  Run your first experiment to see measured performance
                  <br className="desktop-only" /> and compare the numbers that matter.
                </p>
                <span className="empty-caption">
                  <Check size={13} />
                  No synthetic scores. No pre-filled benchmarks.
                </span>
              </div>
            )}
          </section>
          <section className="card agreement-card">
            <div className="card-heading">
              <h3>
                <GitCompareArrows size={17} />
                Engine agreement
              </h3>
              <span className="subtle-tag">Centipawn spread</span>
            </div>
            {result ? (
              <div className="agreement-list">
                {positions.map(([fen, name]) => {
                  const comparison = result.comparisons?.[fen];
                  const rows = result.rows.filter((row) => row.fen === fen);
                  const disagreement =
                    comparison?.disagreementCp ?? scoreDisagreementCp(rows.map((row) => row.score));
                  const mateCount =
                    comparison?.mateCount ?? rows.filter((row) => row.score.type === 'mate').length;
                  return (
                    <div className="agreement-row" key={fen}>
                      <div>
                        <strong>{name}</strong>
                        <span>
                          {disagreement === null
                            ? mateCount
                              ? 'Mate evaluations are not averaged with centipawns'
                              : 'Only one centipawn evaluation'
                            : `${rows.length} engines / ${(disagreement / 100).toFixed(2)} pawn spread`}
                        </span>
                      </div>
                      <span className="mono">
                        {disagreement === null ? '\u2014' : `${disagreement} cp`}
                      </span>
                    </div>
                  );
                })}
                <p className="tiny muted">
                  Mate scores are counted, not averaged into centipawn means. Smaller spreads mean
                  closer evaluations, not proof that either engine is correct.
                </p>
              </div>
            ) : (
              <div className="agreement-empty">
                Run an experiment to measure how closely engines agree.
              </div>
            )}
          </section>
          <section className="card experiment-guide">
            <span className="guide-icon">
              <FlaskConical size={24} />
            </span>
            <div>
              <h3>A fair test starts with the same conditions.</h3>
              <p>
                Keep depth, threads, and hash consistent. Repeat runs on an idle machine, and
                compare the full picture, not just the fastest number.
              </p>
              <button className="text-button" onClick={onDocs}>
                Read the benchmarking guide
                <ArrowUpRight size={13} />
              </button>
            </div>
          </section>
        </div>
      </div>
      <section className="card benchmark-table-card">
        <div className="card-heading">
          <h3>
            <BarChart3 size={17} />
            {mode === 'compare' ? 'Comparison results' : 'Benchmark results'}
          </h3>
          <div className="table-actions">
            {history.length > 1 && (
              <select
                aria-label="Select completed run"
                disabled={job.busy}
                value={result?.id ?? ''}
                onChange={(event) =>
                  setSelectedRun(history.find((run) => run.id === event.target.value))
                }
              >
                {history.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.createdAt).toLocaleString()} / {run.rows.length} searches
                  </option>
                ))}
              </select>
            )}
            <button
              className="button secondary small"
              disabled={!result}
              onClick={() => {
                if (result)
                  downloadFile(`openchesslab-${result.id}.csv`, benchmarkCsv(result), 'text/csv');
              }}
            >
              <ArrowDownToLine size={14} />
              Export CSV
            </button>
            <button
              className="text-button tiny"
              disabled={!result}
              onClick={() => {
                if (result)
                  downloadFile(
                    `openchesslab-${result.id}.json`,
                    JSON.stringify(result, null, 2),
                    'application/json',
                  );
              }}
            >
              JSON
            </button>
            <button
              className="icon-button"
              aria-label="Clear saved benchmark history"
              title="Clear saved benchmark history"
              disabled={(!history.length && !saved.warning) || job.busy}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {result && (
          <div className="result-context">
            <span>{job.busy ? 'Showing a previous completed run' : 'Completed run'}</span>
            <time dateTime={result.createdAt}>{new Date(result.createdAt).toLocaleString()}</time>
          </div>
        )}
        <div className="table-scroll" role="region" aria-label="Engine search results" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Engine / position</th>
                <th>Evaluation</th>
                <th>Best move</th>
                <th>Depth</th>
                <th>Nodes</th>
                <th>NPS</th>
                <th>Search time</th>
              </tr>
            </thead>
            <tbody>
              {result?.rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <strong>{row.engineName}</strong>
                    <span className="table-secondary">{row.position}</span>
                  </td>
                  <td>
                    <span className="table-score">{formatScore(row.score)}</span>
                  </td>
                  <td className="mono">{row.bestMove ?? '\u2014'}</td>
                  <td>
                    {row.depth ?? '\u2014'}
                    <span className="muted"> / {row.requestedDepth}</span>
                    {row.depthLimited && (
                      <span className="limited-label" title="Requested depth was not confirmed">
                        limited
                      </span>
                    )}
                  </td>
                  <td className="mono">{row.nodes?.toLocaleString() ?? '\u2014'}</td>
                  <td className="mono">{row.nps?.toLocaleString() ?? '\u2014'}</td>
                  <td className="mono">{(row.wallTimeMs / 1000).toFixed(2)}s</td>
                </tr>
              ))}
              {!result && (
                <tr>
                  <td colSpan={7} className="empty-table">
                    Your next experiment starts here. Results will appear after a completed run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {result
              ? `${result.environment.platform} / ${result.environment.arch} / ${result.environment.cpus} logical CPUs / Node ${result.environment.node} / OpenChessLab ${result.appVersion ?? 'version not recorded'}`
              : 'Benchmarks are isolated from other application jobs.'}
          </span>
          <span>
            {history.length} {history.length === 1 ? 'run' : 'runs'}{' '}
            {saved.persistent ? 'saved locally' : 'this session'}
          </span>
        </div>
        {result?.rows.some((row) => row.warnings.length) && (
          <div className="inline-note result-warning">
            <Info size={15} />
            Some measurements are unavailable, requested depths were not confirmed, or engine
            defaults were used. See the JSON export for per-search warnings and effective options.
          </div>
        )}
      </section>
      {(saved.warning || historyError) && (
        <div className="inline-note" role="status">
          <Info size={15} />
          {historyError || saved.warning}
        </div>
      )}
      <p className="page-footnote">
        Evaluations are from White's perspective. Up to 20 completed runs, including their FENs, are
        saved in this browser when storage is available. Export important results for a permanent
        record.
      </p>
      {confirmClear && (
        <Modal
          title="Clear saved benchmark history?"
          description="Close other OpenChessLab tabs before clearing. This removes local saved runs, not downloaded exports or server job records."
          onClose={() => setConfirmClear(false)}
        >
          <div className="modal-footer">
            <button className="button secondary" onClick={() => setConfirmClear(false)}>
              Keep history
            </button>
            <button
              className="button danger"
              onClick={() => {
                const next = clearBenchmarkHistory();
                setSaved(next);
                if (!next.runs.length) {
                  setSelectedRun(undefined);
                  setHistoryError('');
                }
                setConfirmClear(false);
                requestAnimationFrame(() => document.getElementById('position-suite')?.focus());
              }}
            >
              Clear history
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="card metric-card">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
