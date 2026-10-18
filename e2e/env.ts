// Settings shared by the Playwright config, the global setup and the tests.
// Every one can be overridden from the environment.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GANYMEDE_BIN = process.env.GANYMEDE_BIN ?? 'ganymede';
export const GANYMEDE_PORT = Number(process.env.GANYMEDE_PORT ?? 18888);
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 14173);
export const TOKEN = process.env.E2E_TOKEN ?? 'e2e-token';
/** cdp-kernel's kernelspec for Node: TypeScript and JavaScript, no Python. */
export const KERNEL = process.env.E2E_KERNEL ?? 'cdp-node';

export const GANYMEDE_URL = `http://127.0.0.1:${GANYMEDE_PORT}`;
export const APP_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

/**
 * The folder `ganymede serve` runs in, seeded from e2e/fixtures. The config
 * picks it once and passes it to the workers through the environment.
 */
export const ROOT_DIR = (process.env.E2E_ROOT_DIR ??= join(
  tmpdir(),
  `ganymede-ui-e2e-${process.pid}`,
));

export const FIXTURE = 'Galilean moons.ipynb';
