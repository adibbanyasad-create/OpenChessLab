import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp({ config, logger: true });
if (config.host !== '127.0.0.1' && config.host !== 'localhost' && !config.apiToken) {
  app.log.warn(
    'Listening beyond loopback without an API token. Use only on a trusted private network.',
  );
}
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void app
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        app.log.error(error);
        process.exitCode = 1;
      });
  });
}
