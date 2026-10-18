// Starts `ganymede serve` in a fresh folder seeded with e2e/fixtures, waits
// until it answers, and returns the teardown that stops it and removes the
// folder. The app (`vite preview`) is the config's webServer.
import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GANYMEDE_BIN, GANYMEDE_PORT, GANYMEDE_URL, KERNEL, ROOT_DIR, TOKEN } from './env';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function waitForServer(child: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${GANYMEDE_BIN} serve exited with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${GANYMEDE_URL}/api/status?token=${TOKEN}`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`${GANYMEDE_BIN} serve did not answer at ${GANYMEDE_URL} in ${timeoutMs} ms`);
}

export default async function globalSetup() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  cpSync(FIXTURES, ROOT_DIR, { recursive: true });

  const child = spawn(
    GANYMEDE_BIN,
    [
      'serve',
      '--port',
      String(GANYMEDE_PORT),
      '--token',
      TOKEN,
      '--root-dir',
      ROOT_DIR,
      '--default-kernel',
      KERNEL,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  const spawned = new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', e =>
      reject(new Error(`could not start ${GANYMEDE_BIN} (set GANYMEDE_BIN): ${e.message}`)),
    );
  });
  await spawned;
  await waitForServer(child);

  // The fixture names this kernelspec; say so up front if it is missing.
  const specs = await (await fetch(`${GANYMEDE_URL}/api/kernelspecs?token=${TOKEN}`)).json();
  if (!specs.kernelspecs?.[KERNEL]) {
    child.kill('SIGTERM');
    throw new Error(
      `kernelspec ${KERNEL} not found (have: ${Object.keys(specs.kernelspecs ?? {}).join(', ')}). ` +
        'Install cdp-kernel: npm install -g @tlockney/cdp-kernel && cdp-kernel install --runtime node',
    );
  }

  return async () => {
    if (child.exitCode === null) {
      const exited = new Promise(r => child.once('exit', r));
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise(r => setTimeout(r, 5_000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    rmSync(ROOT_DIR, { recursive: true, force: true });
  };
}
