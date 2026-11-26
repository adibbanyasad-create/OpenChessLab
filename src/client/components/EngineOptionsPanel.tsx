import { useEffect, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { EngineCapabilities, SearchSettings, UciOption } from '../../shared/types';
import { api } from '../api';

function optionInputId(engineId: string, name: string): string {
  return `engine-option-${engineId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function CustomOptionField({
  engineId,
  option,
  value,
  onChange,
}: {
  engineId: string;
  option: UciOption;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const id = optionInputId(engineId, option.name);
  if (option.type === 'button') {
    return (
      <div className="custom-option button-option">
        <span>{option.name}</span>
        <small>Buttons cannot be assigned through this interface.</small>
      </div>
    );
  }
  if (option.type === 'check') {
    return (
      <label className="custom-option check-option" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={typeof value === 'boolean' ? value : option.value}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{option.name}</span>
      </label>
    );
  }
  if (option.type === 'combo') {
    return (
      <label className="custom-option">
        {option.name}
        <select
          id={id}
          value={typeof value === 'string' ? value : option.value}
          onChange={(event) => onChange(event.target.value)}
        >
          {option.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (option.type === 'spin') {
    return (
      <label className="custom-option">
        {option.name}
        <input
          id={id}
          type="number"
          min={option.min}
          max={option.max}
          value={typeof value === 'number' ? value : option.value}
          onChange={(event) => {
            if (event.target.value === '') {
              onChange(undefined);
              return;
            }
            const parsed = Number(event.target.value);
            onChange(Number.isInteger(parsed) ? parsed : option.value);
          }}
        />
        <small>
          {option.min}–{option.max}
        </small>
      </label>
    );
  }
  return (
    <label className="custom-option">
      {option.name}
      <input
        id={id}
        type="text"
        maxLength={256}
        value={typeof value === 'string' ? value : option.value}
        placeholder={option.value || 'Engine default'}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function EngineOptionsPanel({
  engineId,
  settings,
  setSettings,
}: {
  engineId: string;
  settings: SearchSettings;
  setSettings: (settings: SearchSettings) => void;
}) {
  const [capabilities, setCapabilities] = useState<EngineCapabilities>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setCapabilities(undefined);
    void api<EngineCapabilities>(`/engines/${engineId}/options`, { signal: controller.signal })
      .then(setCapabilities)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Engine options are unavailable.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [engineId]);

  const options = (capabilities?.options ?? []).filter(
    (option) => !['threads', 'hash', 'multipv'].includes(option.name.toLowerCase()),
  );
  const custom = settings.options ?? {};
  const setCustom = (name: string, value: string | number | boolean | undefined) => {
    const next = { ...custom };
    if (value === undefined || value === '') delete next[name];
    else next[name] = value;
    setSettings(
      Object.keys(next).length
        ? { ...settings, options: next }
        : { ...settings, options: undefined },
    );
  };

  return (
    <details className="advanced-settings engine-options">
      <summary>
        <SlidersHorizontal size={14} />
        Engine options
        <ChevronDown size={14} />
      </summary>
      {loading && <p className="tiny muted">Reading this engine&apos;s advertised options…</p>}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && !options.length && (
        <p className="tiny muted">This engine advertises no additional options.</p>
      )}
      {!loading && !error && options.length > 0 && (
        <div className="custom-options">
          {options.map((option) => (
            <CustomOptionField
              key={option.name}
              engineId={engineId}
              option={option}
              value={custom[option.name]}
              onChange={(value) => setCustom(option.name, value)}
            />
          ))}
        </div>
      )}
      {!loading && !error && options.length > 0 && (
        <p className="tiny muted">
          Only advertised options are sent. Invalid entries are ignored with a visible warning.
        </p>
      )}
    </details>
  );
}
