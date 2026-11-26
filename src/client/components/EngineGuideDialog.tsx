import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal } from './Modal';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'custom-engine'
  );
}

export function EngineGuideDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('My engine');
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const entry = {
    id: slugify(name),
    name: name.trim() || 'My engine',
    description: 'A locally configured UCI engine.',
    command: command.trim(),
    args: [],
  };
  const config = JSON.stringify([entry], null, 2);
  const validCommand =
    command.trim().length > 0 &&
    (command.trim().startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(command.trim()) ||
      command.trim().startsWith('\\\\'));

  return (
    <Modal
      title="Add your engine safely"
      description="Engines are installed by the server operator, not uploaded through the browser. This guide builds a registry entry you can save on the machine running OpenChessLab."
      onClose={onClose}
    >
      <ol className="guide-steps">
        <li>Download or build a UCI engine from a source you trust.</li>
        <li>Place the executable where the server user can read and execute it.</li>
        <li>Save the generated entry below in your server registry file.</li>
        <li>
          Restart with <code>ENGINES_CONFIG=/absolute/path/to/engines.local.json npm start</code>.
        </li>
      </ol>
      <label className="field-label" htmlFor="engine-guide-name">
        Display name
      </label>
      <input
        id="engine-guide-name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="field-label" htmlFor="engine-guide-command">
        Absolute executable path
      </label>
      <input
        id="engine-guide-command"
        value={command}
        spellCheck={false}
        placeholder={
          navigator.platform.startsWith('Win')
            ? 'C:\\Engines\\my-engine.exe'
            : '/usr/local/bin/my-engine'
        }
        onChange={(event) => {
          setCommand(event.target.value);
          setError('');
          setCopied(false);
        }}
      />
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <label className="field-label" htmlFor="engine-guide-config">
        Registry entry
      </label>
      <textarea id="engine-guide-config" readOnly rows={9} value={config} className="mono" />
      <div className="modal-footer">
        <span className="tiny muted">Generated ID: {entry.id}</span>
        <button
          className="button primary"
          onClick={async () => {
            if (!validCommand) {
              setError('Enter an absolute executable path, not a relative filename or URL.');
              return;
            }
            try {
              await navigator.clipboard.writeText(config);
              setCopied(true);
              setError('');
            } catch {
              setError('Clipboard unavailable. Select and copy the registry entry manually.');
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy entry'}
        </button>
      </div>
      <p className="tiny muted">
        A configured engine runs with the server user&apos;s permissions. Only install engines you
        trust; process isolation is not an operating-system sandbox.
      </p>
    </Modal>
  );
}
