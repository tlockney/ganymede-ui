// A machine window (#701) against a second Ganymede server, through a
// stand-in for the app's mount (`mount-proxy.ts`): the page loads from the
// first server's origin with `?machine=<id>` and reaches the second server
// only through `/machines/<id>/`.
import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startMountProxy, type MountProxy } from './mount-proxy';
import { FIXTURE, GANYMEDE_URL, KERNEL, ROOT_DIR, TOKEN } from './env';
import { openNotebook, outputs, sidebarItem } from './helpers';

const MACHINE_PORT = Number(process.env.E2E_MACHINE_PORT ?? 18889);
const PROXY_PORT = Number(process.env.E2E_PROXY_PORT ?? 14274);
const MACHINE_TOKEN = 'machine-token';
const ID = 'e2e-machine-1';
const NAME = 'Second';
const NOTEBOOK = 'Machine notes.ipynb';
const JOURNAL = 'journal/Agent day.ipynb';
const ROOT2 = join(tmpdir(), `ganymede-ui-e2e-machine-${process.pid}`);

let machine: ChildProcess;
let proxy: MountProxy;

test.beforeAll(async () => {
  const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  rmSync(ROOT2, { recursive: true, force: true });
  mkdirSync(join(ROOT2, 'journal'), { recursive: true });
  cpSync(join(fixtures, FIXTURE), join(ROOT2, NOTEBOOK));
  cpSync(join(fixtures, FIXTURE), join(ROOT2, JOURNAL));
  machine = spawn(
    process.env.GANYMEDE_BIN ?? 'ganymede',
    [
      'serve',
      '--port',
      String(MACHINE_PORT),
      '--token',
      MACHINE_TOKEN,
      '--root-dir',
      ROOT2,
      '--default-kernel',
      KERNEL,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${MACHINE_PORT}/api/status?token=${MACHINE_TOKEN}`);
      if (res.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error('the second Ganymede server did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  proxy = await startMountProxy({
    port: PROXY_PORT,
    app: new URL(GANYMEDE_URL),
    machineId: ID,
    machine: new URL(`http://127.0.0.1:${MACHINE_PORT}`),
    machineToken: MACHINE_TOKEN,
    // The machine lists an agent only while an MCP session holds its room;
    // the test checks the machine's own answer below.
    rooms: {
      rooms: [
        {
          path: JOURNAL,
          file_id: 'f1',
          format: 'json',
          type: 'notebook',
          clients: [{ name: 'Claude', kind: 'agent' }],
          last_change: { at: new Date().toISOString(), by: 'Claude', person: false },
        },
        {
          path: NOTEBOOK,
          file_id: 'f2',
          format: 'json',
          type: 'notebook',
          clients: [{ name: 'Thomas', kind: 'person' }],
          last_change: null,
        },
      ],
    },
  });
});

test.afterAll(async () => {
  await proxy?.stop();
  if (machine && machine.exitCode === null) {
    const exited = new Promise(r => machine.once('exit', r));
    machine.kill('SIGTERM');
    await Promise.race([exited, new Promise(r => setTimeout(r, 5_000))]);
    if (machine.exitCode === null) machine.kill('SIGKILL');
  }
  rmSync(ROOT2, { recursive: true, force: true });
});

test.afterEach(() => proxy.setDown(false));

/** The machine window's page, as the app loads it, signed in on the app's cookie. */
async function openMachineWindow(page: import('@playwright/test').Page, open = '') {
  // The first server trades the token for its login cookie, as the app's does.
  await page.goto(`${proxy.url}/?token=${TOKEN}`);
  await page.goto(
    `${proxy.url}/?kernels=server&machine=${ID}&machine_name=${NAME}${open ? `&open=${encodeURIComponent(open)}` : ''}`,
  );
}

test('lists the machine’s files, not this server’s, under a place switcher', async ({ page }) => {
  await openMachineWindow(page);
  await expect(page.getByRole('button', { name: `Place: ${NAME}, reachable` })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Place' }).getByRole('tab')).toHaveText([
    'Files',
    'Journals',
    'Running',
    'Search',
  ]);
  await expect(sidebarItem(page, 'Machine notes')).toBeVisible();
  // This server's own notebooks are somewhere else.
  await expect(sidebarItem(page, 'Galilean moons')).toHaveCount(0);
  await expect(page.getByText(`Saved on ${NAME}`)).toBeVisible();
});

test('opens a notebook live in the machine’s room, on its kernel, and saves there', async ({
  page,
}) => {
  await openMachineWindow(page);
  await openNotebook(page, NOTEBOOK);
  await expect(page).toHaveTitle(`Machine notes · ${NAME}`);
  await page.locator('.jp-CodeCell').first().click();
  await page.keyboard.press('Shift+Enter');
  await expect(
    outputs(page).filter({ hasText: 'Ganymede is the largest moon in the solar system' }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  // Saved on the machine; nothing of it on the server that served the page.
  await expect
    .poll(() => readFileSync(join(ROOT2, NOTEBOOK), 'utf8'))
    .toContain('Ganymede is the largest moon in the solar system');
  expect(existsSync(join(ROOT_DIR, NOTEBOOK))).toBe(false);
  // Recents are the machine's own.
  const recents = await page.evaluate(() => localStorage.getItem('ganymede-ui:recents'));
  expect(JSON.parse(recents!)).toEqual({ [`machine:${ID}`]: [NOTEBOOK] });
});

test('lists the journals and opens one', async ({ page }) => {
  await openMachineWindow(page);
  await page.getByRole('tab', { name: 'Journals' }).click();
  const list = page.getByRole('list', { name: 'Journals' });
  // The room an agent is in; the person's notebook is not a journal.
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByText('Claude')).toBeVisible();
  await expect(list.getByText('running')).toBeVisible();
  // The machine's own list came through the mount, with no agent in it.
  expect(proxy.machineRooms()).toBeDefined();
  const own = proxy.machineRooms() as {
    status: number;
    body: { rooms: { clients: { kind: string }[] }[] };
  };
  expect(own.status).toBe(200);
  expect(Array.isArray(own.body.rooms)).toBe(true);
  expect(own.body.rooms.flatMap(r => r.clients).filter(c => c.kind === 'agent')).toEqual([]);
  await list.getByRole('button', { name: /Agent day/ }).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(page).toHaveTitle(`Agent day · ${NAME}`);
});

test('goes read-only with a banner while the machine is away, and editable when it is back', async ({
  page,
}) => {
  await openMachineWindow(page);
  await openNotebook(page, NOTEBOOK);
  const cells = page.locator('.jp-Cell');
  const before = await cells.count();
  const banner = page.getByRole('status').filter({ hasText: 'went offline · Reconnecting…' });
  await expect(banner).toHaveCount(0);

  proxy.setDown(true);
  await expect(banner).toHaveText(`${NAME} went offline · Reconnecting…`);
  // The reachability dot follows (within its backoff).
  await expect(page.getByRole('button', { name: `Place: ${NAME}, offline` })).toBeVisible({
    timeout: 45_000,
  });
  // The machine's kernel went with it, and JupyterLab says so in a dialog.
  const dialog = page.locator('dialog.jp-Dialog');
  await dialog
    .getByRole('button', { name: 'Ok' })
    .click({ timeout: 10_000 })
    .catch(() => {});
  await expect(dialog).toHaveCount(0);
  // Command-mode edits do nothing: no cell is added or deleted.
  // Not the first cell: the kernel's notice covers it.
  await cells.nth(2).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  // Insert-below did nothing; the count is read after the key has had its turn.
  await page.waitForTimeout(300);
  await expect(cells).toHaveCount(before);
  await page.keyboard.press('d');
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  await expect(cells).toHaveCount(before);

  proxy.setDown(false);
  await expect(banner).toHaveCount(0, { timeout: 45_000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await expect(cells).toHaveCount(before + 1);
  // Put the notebook back as it was, so the file stays as the fixture had it.
  writeFileSync(join(ROOT2, NOTEBOOK), readFileSync(join(ROOT2, JOURNAL)));
});
