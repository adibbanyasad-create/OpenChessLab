// Desktop entry point for the single-file executable: starts the engine
// service on loopback, opens the system browser to the workspace, and shuts
// down cleanly on console close. No CLI flags are needed for normal use:
// double-click the .exe and the workspace appears.
import { execFile } from 'node:child_process';
import { getAsset, isSea } from 'node:sea';
import { createApp } from './app.js';
import { loadConfig, loadEngines } from './config.js';
import { APP_VERSION } from './version.js';

function openBrowser(url: string): void {
  const opener =
    process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', '""', url] }
      : process.platform === 'darwin'
        ? { command: 'open', args: [url] }
        : { command: 'xdg-open', args: [url] };
  execFile(opener.command, opener.args, { windowsHide: true }, () => undefined);
}

async function main(): Promise<void> {
  if (isSea()) {
    let marker: string | ArrayBuffer | undefined;
    try {
      marker = getAsset('openchesslab-sea', 'utf8');
    } catch {
      marker = undefined;
    }
    if (!marker) throw new Error('Desktop bundle is missing its embedded marker asset.');
    // Point the service at the companions staged beside the executable.
    const { dirname, join } = await import('node:path');
    const home = dirname(process.execPath);
    process.env.OPENCHESSLAB_STATIC_ROOT ??= join(home, 'client');
    const runtime = join(home, process.platform === 'win32' ? 'node-runtime.exe' : 'node-runtime');
    const { existsSync } = await import('node:fs');
    if (existsSync(runtime)) process.env.OPENCHESSLAB_NODE ??= runtime;
  }
  const config = loadConfig();
  const engines = loadEngines();
  const app = await createApp({ config, engines, logger: true });
  const url = `http://127.0.0.1:${config.port}/`;
  app.log.info(`OpenChessLab ${APP_VERSION} desktop service on ${url}`);
  try {
    await app.listen({ host: '127.0.0.1', port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
    await app.close();
    return;
  }
  if (process.env.OPENCHESSLAB_NO_BROWSER !== '1') openBrowser(url);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info('Shutting down the desktop service.');
    void app
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        app.log.error(error);
        process.exitCode = 1;
      });
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, shutdown);
  if (process.platform === 'win32') {
    process.on('SIGBREAK', shutdown);
  }
}

// No top-level await: the desktop entry is bundled to CommonJS for the
// single-executable build, where top-level await is unsupported.
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
