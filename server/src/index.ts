import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from './config.ts';
import { Store } from './store.ts';
import { makeProviders } from './providers.ts';
import { createApp, VERSION } from './app.ts';
import { hashPassword } from './auth.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '.env'));

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error((e as Error).message);
  console.error('\nSee server/.env.example');
  process.exit(1);
}

const store = new Store(cfg.dataDir, cfg.dataKey);
const DEMO_USER = 'demo';
const DEMO_PASSWORD = 'demo-password-123';
if (cfg.mode === 'demo' && !store.userByName(DEMO_USER)) {
  store.createUser(DEMO_USER, 'Demo Broker', hashPassword(DEMO_PASSWORD));
}
if (cfg.mode === 'live' && store.userByName(DEMO_USER) && !store.userByName(DEMO_USER)!.disabled) {
  // The demo account has a published password — never allow it in live mode.
  store.setDisabled(DEMO_USER, true);
  console.warn('Demo account disabled for live mode.');
}
if (cfg.mode === 'demo' && store.userByName(DEMO_USER)?.disabled) store.setDisabled(DEMO_USER, false);
if (store.countUsers() === 0) {
  console.warn('No broker accounts yet. Create one with:  npm --workspace server run user:create');
}

const { transcription, extraction } = makeProviders(cfg);
const { server, worker } = createApp({ cfg, store, transcription, extraction });
worker.start();

server.listen(cfg.port, cfg.host, () => {
  console.log(`\nMortgage Options server v${VERSION}`);
  console.log(`Mode: ${cfg.mode.toUpperCase()}  ·  transcription: ${transcription.name}  ·  extraction: ${extraction.name} (${extraction.model})`);
  for (const w of cfg.warnings) console.warn(`WARNING: ${w}`);
  console.log(`\nListening on port ${cfg.port}. From your phone use one of:`);
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const a of ifs ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`   http://${a.address}:${cfg.port}`);
  }
  console.log('   (or your HTTPS tunnel URL — see docs/WINDOWS_SETUP.md)');
  if (cfg.mode === 'demo') console.log(`\nDEMO MODE — sign in as "${DEMO_USER}" / "${DEMO_PASSWORD}". No real AI calls are made.`);
});

const shutdown = () => {
  worker.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
