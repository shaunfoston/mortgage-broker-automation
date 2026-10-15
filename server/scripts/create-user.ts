/**
 * Create or reset a broker account.
 *   npm --workspace server run user:create
 *   npm --workspace server run user:create -- --username alan --name "Alan Smith"
 *   npm --workspace server run user:create -- --username alan --disable
 */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { hashPassword, passwordProblems } from '../src/auth.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '.env'));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ask(q: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = process.stdout as any;
      (rl as any)._writeToOutput = (s: string) => {
        if (s.includes(q)) out.write(s);
        else out.write('*');
      };
    }
    rl.question(q, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a);
    });
  });
}

const cfg = loadConfig(process.env, ['', '', '--demo']); // only dataDir is needed here
const store = new Store(cfg.dataDir, cfg.dataKey);
const username = (arg('username') ?? (await ask('Username: '))).trim().toLowerCase();
if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
  console.error('Username must be 3–40 characters: letters, numbers, . _ -');
  process.exit(1);
}
if (process.argv.includes('--disable')) {
  console.log(store.setDisabled(username, true) ? `Disabled ${username}` : 'No such user');
  process.exit(0);
}
const password = process.env.MO_PASSWORD ?? (await ask('Password (min 12 chars): ', true));
const problems = passwordProblems(password);
if (problems.length) {
  console.error(`Password must be: ${problems.join(', ')}`);
  process.exit(1);
}
const existing = store.userByName(username);
if (existing) {
  store.setPassword(username, hashPassword(password));
  store.setDisabled(username, false);
  console.log(`Password reset for ${username}`);
} else {
  const name = arg('name') ?? ((await ask('Display name (shown on records): ')).trim() || username);
  store.createUser(username, name, hashPassword(password));
  console.log(`Created broker account ${username}`);
}
store.close();
