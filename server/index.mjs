import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createMediaRouter } from './media.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function startServer() {
  const port = Number(process.env.PORT ?? 4310);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const media = createMediaRouter({ dataDir: resolve(projectRoot, 'data/media') });
  const app = createApp({ dbPath: process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(projectRoot, 'data/formworks.sqlite'),
    staticDir: resolve(projectRoot, 'dist'), apiHandler: (req, res, url) => media.handle(req, res, url), resolveSources: media.resolveSources, capabilities: media.capabilities });
  await new Promise((accept, reject) => { app.server.once('error', reject); app.server.listen(port, host, accept); });
  console.log(`Formworks is ready: http://${host}:${port}`);
  const stop = async () => { await media.close?.(); await app.close(); };
  process.once('SIGINT', () => stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
  return { ...app, media, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}
